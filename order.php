<?php
/**
 * order.php — приём заказов с сайта grandorf74.ru.
 *
 * Получает JSON от cart.js, полностью пересчитывает цену на сервере
 * (клиенту доверять нельзя — цену и параметры можно подделать через
 * консоль браузера), затем отправляет уведомление в Telegram и на почту.
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'method_not_allowed']);
    exit;
}

$config = require __DIR__ . '/config.php';
require __DIR__ . '/mailer.php';

function respond(bool $ok, string $error = ''): void
{
    echo json_encode(['ok' => $ok, 'error' => $error], JSON_UNESCAPED_UNICODE);
    exit;
}

function isWithinBusinessHours(DateTime $dt): bool
{
    // 1=Пн ... 5=Пт, 6=Сб, 7=Вс
    $dow = (int)$dt->format('N');
    $minutes = (int)$dt->format('H') * 60 + (int)$dt->format('i');
    if ($dow >= 1 && $dow <= 5) {
        return $minutes >= 11 * 60 && $minutes <= 20 * 60;
    }
    if ($dow === 6) {
        return $minutes >= 10 * 60 && $minutes <= 14 * 60 + 30;
    }
    return false; // воскресенье — выходной
}

function sendTelegramMessage(string $token, string $chatId, string $text): bool
{
    if ($token === '' || $chatId === '' || strpos($token, 'ВСТАВЬТЕ') === 0) {
        return false;
    }
    $url = "https://api.telegram.org/bot{$token}/sendMessage";
    $payload = json_encode(['chat_id' => $chatId, 'text' => $text], JSON_UNESCAPED_UNICODE);

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $payload,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 10,
    ]);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return $response !== false && $httpCode === 200;
}

// ---------- читаем и разбираем тело запроса ----------
$raw = file_get_contents('php://input', false, null, 0, 200 * 1024); // ограничение 200 КБ
$data = json_decode((string)$raw, true);
if (!is_array($data)) {
    respond(false, 'bad_request');
}

// ---------- товары ----------
$items = $data['items'] ?? null;
if (!is_array($items) || count($items) === 0 || count($items) > 50) {
    respond(false, 'empty_cart');
}

$cleanItems = [];
$subtotal = 0.0;
foreach ($items as $it) {
    if (!is_array($it)) {
        respond(false, 'bad_item');
    }
    $id = trim((string)($it['id'] ?? ''));
    $title = trim((string)($it['title'] ?? ''));
    $weight = trim((string)($it['weight'] ?? ''));
    $price = $it['price'] ?? null;
    $qty = $it['qty'] ?? null;

    if ($id === '' || $weight === '' || !is_numeric($price) || (float)$price <= 0 || (float)$price > 1000000) {
        respond(false, 'bad_item');
    }
    if (!is_numeric($qty) || (int)$qty <= 0 || (int)$qty > 100) {
        respond(false, 'bad_item');
    }

    $price = (float)$price;
    $qty = (int)$qty;
    $cleanItems[] = ['id' => $id, 'title' => $title, 'weight' => $weight, 'price' => $price, 'qty' => $qty];
    $subtotal += $price * $qty;
}

// ---------- способ получения ----------
$method = (string)($data['deliveryMethod'] ?? '');
if (!in_array($method, ['pickup', 'delivery'], true)) {
    respond(false, 'bad_delivery_method');
}

// ---------- телефон ----------
$phoneRaw = (string)($data['phone'] ?? '');
$phoneDigits = preg_replace('/\D+/', '', $phoneRaw);
if (strlen($phoneDigits) === 11 && $phoneDigits[0] === '8') {
    $phoneDigits = '7' . substr($phoneDigits, 1);
}
if (strlen($phoneDigits) !== 11 || $phoneDigits[0] !== '7') {
    respond(false, 'bad_phone');
}
$phoneFormatted = '+7 (' . substr($phoneDigits, 1, 3) . ') ' . substr($phoneDigits, 4, 3)
    . '-' . substr($phoneDigits, 7, 2) . '-' . substr($phoneDigits, 9, 2);

// ---------- адрес (только для доставки) ----------
$address = trim((string)($data['address'] ?? ''));
if ($method === 'delivery') {
    if ($address === '' || mb_strlen($address) > 300) {
        respond(false, 'bad_address');
    }
} else {
    $address = '';
}

// ---------- желаемое время ----------
$timeZone = new DateTimeZone('Asia/Yekaterinburg'); // часовой пояс Челябинска
$desiredTimeRaw = (string)($data['desiredTime'] ?? '');
$ts = strtotime($desiredTimeRaw);
if ($ts === false) {
    respond(false, 'bad_time');
}
$dt = new DateTime('@' . $ts);
$dt->setTimezone($timeZone);

$now = new DateTime('now', $timeZone);
$maxFuture = (clone $now)->modify('+10 days'); // запас на случай "мягкого расширения" при закрытых выходных
$minAllowed = (clone $now)->modify('-5 minutes'); // небольшой запас на задержку сети/клика
if ($dt < $minAllowed || $dt > $maxFuture) {
    respond(false, 'bad_time');
}
if (!isWithinBusinessHours($dt)) {
    respond(false, 'bad_time');
}

// ---------- пересчёт итога на сервере (не доверяем цене от клиента) ----------
$FREE_DELIVERY_THRESHOLD = 7000.0;
$DISCOUNT_RATE = 0.07;
$total = $subtotal;
$deliveryFree = null;
$discount = 0.0;
if ($method === 'delivery') {
    if ($subtotal >= $FREE_DELIVERY_THRESHOLD) {
        $deliveryFree = true;
    } else {
        $discount = round($subtotal * $DISCOUNT_RATE);
        $total = $subtotal - $discount;
        $deliveryFree = false;
    }
}

// ---------- текст заказа для Telegram/почты ----------
$lines = [];
$lines[] = 'Новый заказ — Grandorf74.ru';
$lines[] = 'Дата: ' . $now->format('d.m.Y H:i');
$lines[] = '';
$lines[] = 'Товары:';
foreach ($cleanItems as $it) {
    $lines[] = sprintf(
        '— %s (%s) × %d — %s ₽',
        $it['title'] !== '' ? $it['title'] : $it['id'],
        $it['weight'],
        $it['qty'],
        number_format($it['price'] * $it['qty'], 0, ',', ' ')
    );
}
$lines[] = '';
$lines[] = 'Сумма товаров: ' . number_format($subtotal, 0, ',', ' ') . ' ₽';
if ($method === 'delivery') {
    if ($deliveryFree) {
        $lines[] = 'Доставка: бесплатно';
    } else {
        $lines[] = 'Скидка 7%: −' . number_format($discount, 0, ',', ' ') . ' ₽';
    }
}
$lines[] = 'Итого: ' . number_format($total, 0, ',', ' ') . ' ₽';
$lines[] = '';
$lines[] = 'Способ получения: ' . ($method === 'pickup' ? 'Самовывоз' : 'Доставка');
if ($method === 'delivery') {
    $lines[] = $deliveryFree
        ? 'Кто везёт: МЫ (Яндекс.Такси, доставка бесплатна)'
        : 'Кто везёт: КЛИЕНТ САМ (свой курьер/такси, скидка 7% вместо доставки)';
    $lines[] = 'Адрес: ' . $address;
}
$lines[] = 'Желаемое время: ' . $dt->format('d.m.Y H:i');
$lines[] = 'Телефон: ' . $phoneFormatted;

$orderText = implode("\n", $lines);

// ---------- уведомления ----------
$telegramOk = true;
if (!empty($config['telegram']['enabled'])) {
    $telegramOk = sendTelegramMessage((string)$config['telegram']['token'], (string)$config['telegram']['chat_id'], $orderText);
}

$mailer = new SimpleSmtpMailer($config['smtp']);
$emailOk = $mailer->send(
    $config['smtp']['from_email'],
    $config['smtp']['from_name'],
    $config['notify_emails'],
    'Новый заказ — ' . $phoneFormatted,
    $orderText
);
if (!$emailOk) {
    error_log('order.php mail error: ' . $mailer->getLastError());
}

// Если оба канала недоступны — не теряем заказ, пишем в резервный лог-файл.
if (!$emailOk && !$telegramOk) {
    @file_put_contents(__DIR__ . '/orders_fallback.log', "----\n" . $orderText . "\n", FILE_APPEND);
    respond(false, 'notify_failed');
}

respond(true);

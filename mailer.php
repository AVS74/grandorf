<?php
/**
 * mailer.php — минимальный SMTP-клиент без внешних зависимостей (composer не нужен).
 * Достаточно для отправки уведомлений о заказах через один SMTP-аккаунт.
 *
 * Все пользовательские данные (телефон, адрес) попадают только в ТЕЛО письма,
 * а не в заголовки — это защищает от email header injection.
 */

class SimpleSmtpMailer
{
    private $host;
    private $port;
    private $username;
    private $password;
    private $secure; // 'ssl' | 'tls'
    private $timeout = 15;
    private $lastError = '';

    public function __construct(array $cfg)
    {
        $this->host = $cfg['host'];
        $this->port = (int)$cfg['port'];
        $this->username = $cfg['username'];
        $this->password = $cfg['password'];
        $this->secure = $cfg['secure'] ?? 'ssl';
    }

    public function getLastError(): string
    {
        return $this->lastError;
    }

    /**
     * @param string   $fromEmail
     * @param string   $fromName
     * @param string[] $toEmails
     * @param string   $subject
     * @param string   $body
     */
    public function send(string $fromEmail, string $fromName, array $toEmails, string $subject, string $body): bool
    {
        $prefix = $this->secure === 'ssl' ? 'ssl://' : '';
        $conn = @fsockopen($prefix . $this->host, $this->port, $errno, $errstr, $this->timeout);
        if (!$conn) {
            $this->lastError = "Не удалось подключиться к SMTP: {$errstr} ({$errno})";
            return false;
        }
        stream_set_timeout($conn, $this->timeout);

        try {
            $this->expect($conn, '220');
            $this->command($conn, 'EHLO grandorf74.ru', '250');

            if ($this->secure === 'tls') {
                $this->command($conn, 'STARTTLS', '220');
                if (!stream_socket_enable_crypto($conn, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                    throw new RuntimeException('Не удалось установить TLS-соединение');
                }
                $this->command($conn, 'EHLO grandorf74.ru', '250');
            }

            $this->command($conn, 'AUTH LOGIN', '334');
            $this->command($conn, base64_encode($this->username), '334');
            $this->command($conn, base64_encode($this->password), '235');

            $this->command($conn, "MAIL FROM:<{$fromEmail}>", '250');
            foreach ($toEmails as $to) {
                $this->command($conn, "RCPT TO:<{$to}>", ['250', '251']);
            }
            $this->command($conn, 'DATA', '354');

            $headers = [];
            $headers[] = 'From: ' . $this->encodeHeader($fromName) . " <{$fromEmail}>";
            $headers[] = 'To: ' . implode(', ', $toEmails);
            $headers[] = 'Subject: ' . $this->encodeHeader($subject);
            $headers[] = 'MIME-Version: 1.0';
            $headers[] = 'Content-Type: text/plain; charset=UTF-8';
            $headers[] = 'Content-Transfer-Encoding: 8bit';
            $headers[] = 'Date: ' . date('r');

            $message = implode("\r\n", $headers) . "\r\n\r\n" . $this->dotStuff($body) . "\r\n.";
            fwrite($conn, $message . "\r\n");
            $this->expect($conn, '250');

            fwrite($conn, "QUIT\r\n");
            fclose($conn);
            return true;
        } catch (Throwable $e) {
            $this->lastError = $e->getMessage();
            @fclose($conn);
            return false;
        }
    }

    private function dotStuff(string $body): string
    {
        // экранируем строки, начинающиеся с точки (требование протокола SMTP)
        return preg_replace('/^\./m', '..', $body);
    }

    private function encodeHeader(string $text): string
    {
        return '=?UTF-8?B?' . base64_encode($text) . '?=';
    }

    /** @param string|string[] $expectedCodes */
    private function command($conn, string $cmd, $expectedCodes): void
    {
        fwrite($conn, $cmd . "\r\n");
        $this->expect($conn, $expectedCodes);
    }

    /** @param string|string[] $expectedCodes */
    private function expect($conn, $expectedCodes): string
    {
        if (!is_array($expectedCodes)) {
            $expectedCodes = [$expectedCodes];
        }
        $response = '';
        while ($line = fgets($conn, 515)) {
            $response .= $line;
            // многострочный ответ SMTP заканчивается строкой вида "250 " (пробел на 4-й позиции)
            if (isset($line[3]) && $line[3] === ' ') {
                break;
            }
        }
        $code = substr($response, 0, 3);
        if (!in_array($code, $expectedCodes, true)) {
            throw new RuntimeException('SMTP error: expected ' . implode('/', $expectedCodes) . ', got: ' . trim($response));
        }
        return $response;
    }
}

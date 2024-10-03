
# NZ Notify

**NZ Notify** — це Chrome-розширення, яке відслідковує оновлення на сайті [nz.ua](https://nz.ua) (нові оцінки, домашні завдання, новини) і сповіщає про них через браузер або через Telegram-бот. (Звісно якщо хром відкритий і ви авторизовані в щоденнику). 

## Особливості

- Сповіщення про новини, оцінки та домашні завдання на сайті nz.ua.
- Можливість налаштувати інтервали перевірки новин.
- Сповіщення можуть надсилатися як через Chrome, так і через вашого Telegram-бота.
- Просте налаштування через інтерфейс розширення.

## Встановлення

1. Завантажте репозиторій:
   ```bash
   git clone https://github.com/yourusername/nz-notify.git
   ```

2. Перейдіть до папки проекту:
   ```bash
   cd nz-notify
   ```

3. Відкрийте Google Chrome та перейдіть до сторінки розширень:
   ```
   chrome://extensions/
   ```

4. Увімкніть режим розробника (Developer mode).

5. Натисніть на кнопку "Завантажити розпаковане розширення" (Load unpacked) і виберіть папку з проектом.

6. Після цього розширення буде встановлено в браузері.

## Налаштування

Після встановлення ви можете налаштувати розширення через натискання на іконку розширення у браузері для швидкого доступу до налаштувань.

### Налаштування в розширенні

У розширенні доступні такі параметри:
- **Увімкнути сповіщення Telegram**: Дозволяє надсилати сповіщення через Telegram.
- **Telegram Token**: Токен вашого Telegram-бота.
- **Telegram Chat ID**: ID чату або групи в Telegram, куди будуть надсилатися сповіщення.
- **Увімкнути сповіщення Chrome**: Дозволяє показувати сповіщення через Chrome.
- **Інтервал перевірки новин**: Інтервал у хвилинах для перевірки новин.
- **Затримка між сповіщеннями**: Затримка в мілісекундах між показом окремих сповіщень (якщо їх декілька).

## Запуск у режимі розробки

(с) 2024 Vasyl Kuzenko

# ProtrenerovKids.ru — справочник API

Все запросы и ответы — JSON (`Content-Type: application/json`), кроме экспорта CSV.
Авторизованные запросы — заголовок `Authorization: Bearer <токен>`.

Условные обозначения доступа: 🌍 публичный (без токена) · 🧑‍🏫 тренер (токен `type:'coach'`) · 🧑‍💼 менеджер · 👑 только супер-админ.

---

## Вход по SMS-коду

Единый флоу для тренера и менеджера/супер-админа — кто именно логинится,
определяется после подтверждения кода по совпадению номера телефона, не по
выбору на фронте.

### 🌍 `POST /api/auth/sms/request`
```json
{ "phone": "+79001234567", "captchaToken": "<токен с виджета Yandex SmartCaptcha>" }
```
`captchaToken` можно не передавать в деве, если `YANDEX_CAPTCHA_SECRET` не задан в `.env` — проверка тогда пропускается с предупреждением в консоли.
**Ответ:** `200 { "sent": true }` — не сообщает, найден ли аккаунт с этим номером (чтобы номер нельзя было проверить на существование по ответу).

### 🌍 `POST /api/auth/verify-code`
```json
{ "phone": "+79001234567", "code": "123456" }
```
Код одноразовый, действует 5 минут, максимум 5 попыток ввода (см. `lib/otpStore.js`).
**Ответ:** `200 { "token": "...", "role"?: "MANAGER"|"SUPER_ADMIN" }` для админа, `200 { "token": "..." }` для тренера. `404`, если номер подтверждён, но анкеты/аккаунта с ним нет.

### 🌍 `GET /api/auth/vk/callback`
Заглушка, `501` — см. `BLOCKED_EXTERNAL.md` (п. 6).

---

## Claim-ссылка — подтверждение анкеты тренером

### 🌍 `GET /api/claim/:token`
Предпросмотр анкеты для тренера до подтверждения. `404`, если ссылка недействительна/уже использована.

### 🌍 `POST /api/claim/:token/confirm`
```json
{ "consent": true }
```
Переводит анкету `PENDING_CONSENT` → `VERIFIED`, гасит токен, логирует согласие. `400` без `consent: true` или если ссылка недействительна.

---

## Публичный каталог

### 🌍 `GET /api/coaches`
Список опубликованных тренеров.
**Query-параметры:** `sport`, `ageGroup`, `arena` — все необязательные.
```
GET /api/coaches?sport=figure_skating&ageGroup=7-12
```
**Ответ:** `200` — массив тренеров без телефона и документов:
```json
[{ "id": "...", "fullName": "...", "photoUrl": "...", "sport": "...", "experienceYears": 9, "priceFrom": 1800, "rating": 4.9, "reviewsCount": 86 }]
```

### 🌍 `GET /api/coaches/:id`
Публичный профиль. `404`, если анкета не найдена или не в статусе `VERIFIED`.
Телефон, Telegram и MAX (`directContactPhone`/`directContactTelegram`/`directContactMax`) отдаются только если у тренера `bookingMode: "DIRECT_CONTACT"`.

### 🌍 `POST /api/coaches/:id/booking`
Заявка на запись (режим «форма»).
```json
{
  "clientName": "Иванова Софья",
  "clientPhone": "+79001234567",
  "childName": "Иванова Софья",
  "childAge": 7,
  "consent": true
}
```
`consent` обязателен — без него `400`. `409`, если у тренера не режим `FORM`.
**Ответ:** `201` — созданная заявка.

### 🌍 `POST /api/coaches/:id/contact-click`
Клик по прямому контакту — вызывается при показе номера телефона (после «Показать номер») или при клике на Telegram/MAX/соцсети.
```json
{ "channel": "PHONE" }
```
`channel` — один из `PHONE` / `TELEGRAM` / `MAX`. Ограничено 30 запросами за 15 минут с одного IP.
**Ответ:** `201 { "ok": true }`. Увеличивает `Coach.contactClicksCount` и пишет строку в журнал `ContactClick` — на этих данных строится сортировка «самый популярный тренер» в админке.

---

## Отзывы (публично)

### 🌍 `POST /api/coaches/:id/reviews`
```json
{ "clientPhone": "+79619200000", "isAnonymous": false, "text": "...", "rating": 5 }
```
Создаёт отзыв со статусом «не подтверждён», отправляет SMS-код (пока — в консоль сервера, см. `TODO` в коде).
**Ответ:** `201 { "reviewId": "...", "message": "Код подтверждения отправлен по SMS" }`

### 🌍 `POST /api/reviews/:id/confirm`
```json
{ "code": "482913" }
```
Подтверждает отзыв, публикует его, пересчитывает рейтинг тренера. Код живёт 5 минут.

### 🌍 `POST /api/reviews/:reviewId/complaints`
Кнопка «⚑ Пожаловаться» у отзыва.
```json
{ "reason": "OFFENSIVE", "comment": "...", "reporterContact": "+79001234567" }
```
`reason` — один из `OFFENSIVE` / `WRONG_COACH` / `OTHER`. Контакт необязателен.

---

## Арены, спортшколы, заявки

### 🌍 `GET /api/arenas` — расписание массовых катаний
### 🌍 `GET /api/sport-schools` — только опубликованные

### 🌍 `POST /api/sport-requests`
Заявка на добавление нового вида спорта — полная анкета одним объектом.
```json
{ "consent": true, "fullName": "...", "phone": "...", "sport": "gymnastics", "city": "Екатеринбург", "age": 30, "experienceYears": 5, "about": "...", "price": 1200 }
```

### 🌍 `POST /api/referrals`
«Оставить отзыв» → тренера нет в базе → пригласить.
```json
{ "coachName": "Иванова Ольга", "parentPhone": "+79001234567", "consent": true }
```

---

## Кабинет тренера — 🧑‍🏫 нужен токен `type:'coach'`

| Метод и путь | Что делает |
|---|---|
| `GET /api/me/coach` | своя анкета целиком |
| `PUT /api/me/coach` | обновить (белый список полей — `status` и `documentsVerified` через этот роут поменять нельзя) |
| `POST /api/me/coach/publish` | `{ "consent": true }` → анкета становится `VERIFIED` |
| `GET /api/me/bookings` | свои заявки от учеников |
| `PATCH /api/me/bookings/:id` | `{ "status": "PROCESSED" }` |
| `GET /api/me/diary` | дневник тренировок |
| `PUT /api/me/diary` | `{ "slots": [{ "dayOfWeek": 1, "startTime": "11:15", "arenaId": "...", "studentName": null }] }` — заменяет весь дневник целиком |
| `PATCH /api/me/diary/calendar-toggle` | `{ "enabled": false }` — временно скрыть календарь |
| `POST /api/me/reviews/:id/reply` | `{ "text": "Спасибо за отзыв!" }` |
| `POST /api/me/premium/subscribe` | заводит `Subscription` в статусе `PENDING` через провайдера (сейчас — мок, см. `lib/paymentProvider.js`), `201 { subscriptionId, priceRub }`. `409`, если подписка уже оформлена |
| `POST /api/me/premium/cancel` | отключить подписку — первые 3 дня с последней оплаты возврат полный (вызывает `provider.refund()`, без ложного "возврат выполнен" при неудаче), позже оплаченный период донашивается. Логика — `lib/subscriptionCancel.js`, состояние — в `Subscription`/`Payment`, не в плоских полях `Coach` |
| `GET /api/me/bookings/:id/documents/:type` | PDF по записи (`type`: `contract`\|`consent`), технический генератор на фикстуре — см. `lib/pdfGenerator.js` и `BLOCKED_EXTERNAL.md`. Проверяет владение — чужой booking вернёт `404` |
| `POST /api/me/photo/process-background` | заглушка `501` — сюда подключается remove.bg/Photoroom |

---

## Админка / менеджеры — нужен токен `role: 'MANAGER'` или `'SUPER_ADMIN'`

### Анкеты тренеров (`/api/admin/coaches`)

| Метод и путь | Доступ | Что делает |
|---|---|---|
| `GET /api/admin/coaches?status=DRAFT` | 🧑‍💼 | список — менеджер видит только свои, супер-админ все. `?sortBy=clicks` — по популярности (клики по прямому контакту) |
| `GET /api/admin/coaches/top-by-clicks?limit=10` | 🧑‍💼 | топ самых популярных тренеров по кликам на контакт |
| `GET /api/admin/coaches/:id` | 🧑‍💼 | одна анкета (403, если чужая) |
| `POST /api/admin/coaches` | 🧑‍💼 | создать анкету по итогам звонка (см. ниже про дубли) |
| `PATCH /api/admin/coaches/:id` | 🧑‍💼 | обновить (белый список полей, включая `documentsVerified`) |
| `POST /api/admin/coaches/:id/claim-link` | 🧑‍💼 | DRAFT → PENDING_CONSENT, выдаёт ссылку для тренера |
| `PATCH /api/admin/coaches/:id/archive` | 👑 | архивировать |
| `GET /api/admin/coaches/export/csv` | 👑 | выгрузка CSV, логируется в AuditLog |

**Создание анкеты — пример:**
```json
POST /api/admin/coaches
{ "fullName": "Иванов Иван", "phone": "+79001234567", "sport": "figure_skating", "age": 30, "experienceYears": 5 }
```
Ответы:
- `201 { "coach": {...}, "warning": null }` — всё чисто
- `201 { "coach": {...}, "warning": "Найден тренер с похожим ФИО..." }` — мягкое совпадение, анкета всё равно создана
- `409 { "error": "Тренер с этим номером уже в базе...", "existingCoachId": "..." }` — жёсткий дубль, анкета НЕ создана

### Таблица обзвона (`/api/admin/call-records`)

| Метод и путь | Доступ | Что делает |
|---|---|---|
| `GET /api/admin/call-records` | 🧑‍💼 | свои звонки со всеми комментариями |
| `POST /api/admin/call-records` | 🧑‍💼 | `{ "coachId": "..." }` — создать запись обзвона |
| `PATCH /api/admin/call-records/:id/status` | 🧑‍💼 | `{ "status": "CALLBACK" }` — один из `NEW/NO_ANSWER/CALLBACK/DECLINED/IN_PROGRESS/DONE` |
| `POST /api/admin/call-records/:id/comments` | 🧑‍💼 | `{ "text": "..." }` — добавить запись в журнал. **Эндпоинтов на редактирование/удаление комментария нет.** |

### Отзывы и жалобы (`/api/reviews`)

| Метод и путь | Доступ | Что делает |
|---|---|---|
| `GET /api/reviews/complaints` | 👑 | очередь необработанных жалоб |
| `PATCH /api/reviews/complaints/:id/resolve` | 👑 | `{ "resolution": "hide" }` — `hide` / `move` (+`moveToCoachId`) / `dismiss` |
| `DELETE /api/reviews/:id` | 👑 | мягко скрыть отзыв напрямую, без жалобы |
| `PATCH /api/reviews/:id` | 👑 | отредактировать текст отзыва |

### Статистика менеджера (`/api/admin/manager-stats`)

| Метод и путь | Доступ | Что делает |
|---|---|---|
| `GET /api/admin/manager-stats/me` | 🧑‍💼 | `{ "registeredCount": 12, "verifiedCount": 9 }` — для себя |
| `GET /api/admin/manager-stats/all` | 👑 | то же самое по каждому менеджеру сразу |

### Заявки на новый вид спорта (`/api/admin/sport-requests`)

| Метод и путь | Доступ | Что делает |
|---|---|---|
| `GET /api/admin/sport-requests?status=PENDING` | 👑 | список заявок |
| `POST /api/admin/sport-requests/:id/approve` | 👑 | создаёт и публикует анкету тренера из заявки |
| `POST /api/admin/sport-requests/:id/reject` | 👑 | отклонить |

---

## Коды ошибок

Единый формат ошибки везде: `{ "error": "человекочитаемое сообщение" }`.

| Код | Когда |
|---|---|
| `400` | не хватает обязательных полей / неверное значение (например, статус не из списка) |
| `401` | нет токена или токен недействителен/просрочен |
| `403` | токен есть, но роли/владения недостаточно (например, менеджер лезет в чужую анкету) |
| `404` | ресурс не найден или не в том статусе, чтобы быть видимым |
| `409` | конфликт — сейчас только жёсткий дубль анкеты по телефону |
| `501` | эндпоинт есть, но внешняя интеграция ещё не подключена (явно помечено в коде `TODO`) |

---

## Вебхуки (`/api/webhooks/*`, без авторизации — защищены иначе)

| Эндпоинт | Защита | Идемпотентность |
|---|---|---|
| `POST /api/webhooks/payment` | HMAC-подпись в заголовке `x-signature` (см. `lib/paymentProvider.js`) | уникальный индекс на `Payment.providerEventId` — повтор вебхука не начисляет период дважды |
| `POST /api/webhooks/telegram/:secret` | секрет в самом пути URL (`TELEGRAM_WEBHOOK_SECRET`), несовпадение → тихий `404` | уникальный индекс на `TelegramUpdate.updateId` |
| `POST /api/webhooks/sms-status` | нет (низкий риск, только для отладки доставки) | — |

Модель событий платёжного вебхука — см. подробные комментарии прямо в
`routes/webhooks.js`: одно успешное списание = один оплаченный период,
`subscription.created` сам по себе период не продлевает (иначе двойное
начисление при одновременном приходе обоих событий на первый платёж).

---

## Быстрая проверка руками

```bash
# получить тестовые токены
npm run prisma:seed

# например, список анкет менеджера Ани
curl http://localhost:3000/api/admin/coaches \
  -H "Authorization: Bearer <токен менеджера Ани из вывода seed-скрипта>"
```

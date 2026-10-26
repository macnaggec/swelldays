# L07: локальная проверка кандидата

25 октября 2026. Владелец ответил «готово» после предложенной проверки входа, меню и истории. UI принят в пределах этого перечня. Расширенная матрица устройств/сбоев отдельно не подтверждалась.

## Проверено

- Последняя реализация L05: оба tsc, lint, style boundaries и 1686 client/server тестов — pass. Логи: `.scratch/first-visit-l05/`.
- Web/API build и действующие bundle budgets — pass на L05. В L07 продуктовый код не менялся.
- Scripts: 4 файла / 56 тестов — pass повторно; `.scratch/first-visit-l07/scripts.log`.
- Docker runner web и API заново собраны из текущей рабочей копии — pass. Prisma/Dockerfile/миграции не менялись; migrator повторно не собирался и не запускался.
- Existing web-delivery verifier — pass на временном nginx-контейнере, случайный loopback-порт. Контейнер остановлен. Проверены release, сжатие и целостность JS/CSS, cache headers, stable assets, SPA fallback и missing assets. Подробности проверяющего скрипта: `apps/web/scripts/webDeliveryVerifier.ts`; результат: `delivery.log`.
- API/React: одинаковые H1/H2, обе аудитории и описания, ровно две ссылки — pass. Vitest проверил построение документа из действительного built index.html: главная, buyer/seller и 404/noindex для неподдерживаемых API путей. Это in-process Request/Response с подставленными репозиториями, без работающего API/БД/Caddy. `parity.log`, `home.html`, `documents.json`.
- Ранние изменения запросов SEO ранее прошли 7 интеграционных тестов отдельной БД; `.scratch/seo-2026-10-25/integration-final.log`. В L07 повторно не запускались.
- `git diff --check` — pass.

## Точный локальный кандидат

База: `85dfec585ffcfba68c51951ae5742fff7ef49d5c`, ветка main. Изменения остаются незакоммиченными. Отпечатки изменённых/новых apps/packages: `.scratch/first-visit-l07/source-files.json`. Локальные image IDs: `images.json`.

Образы `swelldays-first-visit-web:20261025` и `swelldays-first-visit-api:20261025` — проверочные. Web собран с явными фиктивными публичными настройками; его нельзя публиковать вместо настоящей production-сборки. Полные логи: `docker-web.log`, `docker-api.log`. Бюджеты не увеличивались; Docker предупреждает об именах публичных VITE build args, реальные секреты в сборку не подавались.

## До публикации

1. Получить реальную конфигурацию Caddy с imports, invocation, mounts и сетями. Подготовить точное изменение: основной `/` и публичные документы через API shim; `/sitemap.xml` через API; `/index.html`, assets, robots и приватные SPA-пути через web. Статические проверки не доказывают реальную маршрутизацию.
2. Проверить активные production release/image IDs и подготовить резервные копии/проверку восстановления. Предыдущие публичные HTTP-наблюдения не считаются свежей проверкой.
3. Отдельно согласовать сохранение изменений в Git и публикацию приложения/Caddy. Проверочные образы с фиктивной конфигурацией не использовать.
4. После публикации проверить начальный HTML и canonical на основном домене, XML sitemap, приватный noindex, health/assets и ручной mobile smoke. Только затем действия в поисковых аккаунтах при доступе.

Агент браузер/dev server/visual suite не запускал: CLAUDE.md §6 требует отдельной текущей инструкции на браузер. Commit/push/tag/deploy, Caddy/DNS и production БД не менялись. Документы roadmap/reports находятся под существующим ignore docs; перед сохранением в Git их нужно включить явно, если это входит в согласованный набор.

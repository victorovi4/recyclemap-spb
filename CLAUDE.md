@AGENTS.md

# Для ИИ-ассистентов: где что искать

Этот проект — **аналог recyclemap.ru для Санкт-Петербурга**. Полное видение и план разбиты на 7 фаз.

## Сначала прочитайте

1. **[CHANGELOG.md](./CHANGELOG.md)** — что уже сделано и где мы сейчас. Это основной «дневник проекта», всегда смотрите сюда при старте новой сессии.
2. **[docs/superpowers/specs/2026-04-22-recyclemap-spb-full-design.md](./docs/superpowers/specs/2026-04-22-recyclemap-spb-full-design.md)** — дизайн всего продукта: цели, стек (Next.js + Yandex Cloud + YDB + NextAuth + Яндекс Карты), 7 фаз A→G.
3. **[docs/superpowers/backlog.md](./docs/superpowers/backlog.md)** — идеи на потом.

## Планы по фазам

- `docs/superpowers/plans/2026-04-22-phase-a-yc-infra.md` — Phase A (✅ завершена 2026-04-22)
- Следующие планы создаются перед стартом соответствующей фазы через skills `superpowers:brainstorming` → `superpowers:writing-plans`.

## Контекст пользователя

Автор проекта — **новичок, никогда не писал код** до этого проекта. Объясняйте подробно, давайте команды копипастой, не пропускайте «очевидное».

## Поддержка CHANGELOG

При завершении значимых шагов (новая фаза, крупный фикс, architectural changes) дописывайте запись в `CHANGELOG.md` в секции `[Unreleased]` → при закрытии фазы переносите в отдельную версию.

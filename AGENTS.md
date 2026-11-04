<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# Architecture
- Database schema lives in `drizzle/migrations` (consolidated from the imported project); add changes as new migrations, never edit applied ones.
- Admin/staff checks run in database functions (`has_staff_role`, `has_admin_access`, `is_super_admin`, `assert_staff`); server functions call them before using the privileged client, so never query `client.server` from route components.
- User-linked tables reference `public.profiles(id)` so admin views can embed profile names via `<table>_<column>_fkey`.
- Phone-only accounts sign in with a synthetic `phone<digits>@mamnoon.app` email, which is why email auto-confirm stays on.
- Subscription expiry runs as a daily database job calling `handle_expired_subscriptions()`; it replaced the old scheduled function.
- Keep the welcome flow in `/welcome` with browser-persisted language preferences; language selection covers welcome and auth screens.

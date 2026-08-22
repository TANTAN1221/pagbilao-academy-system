# Clear old prototype data from your browser

After replacing the files, open your site, press **F12 → Console**, then run:

```js
localStorage.removeItem("pa_full_admin_v2");
localStorage.removeItem("pa_registered_users");
localStorage.removeItem("pa_current_user");
localStorage.removeItem("pa_logged_in_user");
localStorage.removeItem("pa_user_role");
localStorage.removeItem("pa_user_session");
localStorage.removeItem("pa_demo_session");
localStorage.removeItem("pa_auth_role");
```

Refresh the page and log in again.

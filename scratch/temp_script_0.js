
    window.logoutToIndex = window.logoutToIndex || async function () {
      try {
        if (window.paApi && window.paApi.logout) {
          return await window.paApi.logout("index.html");
        }
      } catch (error) {
        console.warn("Logout fallback used:", error);
      }
      ["pa_current_user", "pa_logged_in_user", "pa_user_role", "pa_user_session", "pa_demo_session", "pa_auth_role"].forEach((key) => localStorage.removeItem(key));
      window.location.href = "index.html";
    };
  
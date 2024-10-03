document.addEventListener("DOMContentLoaded", () => {
  const enableTelegram = document.getElementById("enableTelegram");
  const telegramToken = document.getElementById("telegramToken");
  const telegramChatId = document.getElementById("telegramChatId");
  const enableChromeNotifications = document.getElementById(
    "enableChromeNotifications"
  );
  const checkInterval = document.getElementById("checkInterval");
  const notificationDelay = document.getElementById("notificationDelay");
  const saveButton = document.getElementById("save");

  chrome.storage.local.get(
    [
      "enableTelegram",
      "telegramToken",
      "telegramChatId",
      "enableChromeNotifications",
      "checkInterval",
      "notificationDelay",
    ],
    (data) => {
      enableTelegram.checked = data.enableTelegram || false;
      telegramToken.value = data.telegramToken || "";
      telegramChatId.value = data.telegramChatId || "";
      enableChromeNotifications.checked =
        data.enableChromeNotifications || true;
      checkInterval.value = data.checkInterval || 10;
      notificationDelay.value = data.notificationDelay || 500;
    }
  );

  saveButton.addEventListener("click", () => {
    chrome.storage.local.set(
      {
        enableTelegram: enableTelegram.checked,
        telegramToken: telegramToken.value,
        telegramChatId: telegramChatId.value,
        enableChromeNotifications: enableChromeNotifications.checked,
        checkInterval: parseInt(checkInterval.value, 10),
        notificationDelay: parseInt(notificationDelay.value, 10),
      },
      () => {
        const toast = document.getElementById("toast");
        toast.classList.add("show");

        setTimeout(() => {
          toast.classList.remove("show");
        }, 3000);
      }
    );
  });
});

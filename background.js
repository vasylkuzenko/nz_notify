const SAVED_NEWS_KEY = "savedNZNews";
const NZ_NEWS_URL = "https://nz.ua/dashboard/news";

let notificationMapping = {};

function sendTelegramMessage(message, settings) {
  if (
    !settings.enableTelegram ||
    !settings.telegramToken ||
    !settings.telegramChatId
  ) {
    return;
  }

  const TELEGRAM_API_URL = `https://api.telegram.org/bot${settings.telegramToken}/sendMessage`;

  fetch(TELEGRAM_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: settings.telegramChatId,
      text: message,
    }),
  })
    .then((response) => response.json())
    .then((data) => {
      if (!data.ok) {
        console.error(
          "Помилка надсилання повідомлення в Telegram:",
          data.description
        );
      }
    })
    .catch((error) => console.error("Помилка при виконанні запиту:", error));
}

function closeTabOrWindow(tabId, windowId) {
  if (windowId) {
    chrome.windows.remove(windowId);
  } else {
    chrome.tabs.remove(tabId);
  }
}

function openPage(url, handler) {
  chrome.windows.getCurrent({}, (window) => {
    if (window.state === "fullscreen") {
      openTab(url, handler);
    } else {
      openWindow(url, handler);
    }
  });
}

function openTab(url, handler) {
  chrome.tabs.create({ url: url, active: false }, (newTab) => {
    chrome.tabs.onUpdated.addListener(function listener(
      tabIdUpdated,
      changeInfo
    ) {
      if (newTab.id === tabIdUpdated && changeInfo.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        handler(newTab.id);
      }
    });
  });
}

function openWindow(url, handler) {
  chrome.windows.create(
    {
      url: url,
      type: "popup",
      focused: false,
      width: 1,
      height: 1,
      left: -10000,
      top: -10000,
    },
    (newWindow) => {
      const activeTab = newWindow.tabs[0];
      chrome.tabs.onUpdated.addListener(function listener(
        tabIdUpdated,
        changeInfo
      ) {
        if (activeTab.id === tabIdUpdated && changeInfo.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener);
          handler(activeTab.id, newWindow.id);
        }
      });
    }
  );
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendNotificationsWithDelay(newNews, settings) {
  newNews.reverse();

  const chromeNotificationsEnabled =
    settings.enableChromeNotifications !== false;

  for (const newsItem of newNews) {
    if (chromeNotificationsEnabled) {
      chrome.notifications.create(
        {
          type: "basic",
          iconUrl: "icon.png",
          title: `Новина від ${newsItem.date}`,
          message: newsItem.text,
        },
        (id) => {
          notificationMapping[id] = NZ_NEWS_URL;
        }
      );
    }
    sendTelegramMessage(
      `📚 ${newsItem.date}\n${newsItem.text}\n${NZ_NEWS_URL}`,
      settings
    );

    await delay(settings.notificationDelay);
  }
}

function handleNewsPage(tabId, windowId = null) {
  chrome.scripting.executeScript(
    {
      target: { tabId: tabId },
      function: () => {
        try {
          const newsItems = document.querySelectorAll(
            ".news-page__item[data-key]"
          );
          const loginRequired = document.querySelector('form[action*="login"]');
          const noNewsBlock = !document.querySelector(".news-page__item");

          if (loginRequired) {
            return { error: "login_required" };
          }

          if (noNewsBlock) {
            return { error: "no_news_block" };
          }

          return Array.from(newsItems).map((item) => ({
            id: item.getAttribute("data-key"),
            text:
              item.querySelector(".news-page__desc")?.innerText || "Без опису",
            date:
              item.querySelector(".news-page__date")?.innerText || "Без дати",
            link: item.querySelector("a")?.getAttribute("href") || "#",
          }));
        } catch (error) {
          return { error: "fetch_error" };
        }
      },
    },
    (results) => {
      if (chrome.runtime.lastError) {
        chrome.notifications.create({
          type: "basic",
          iconUrl: "icon.png",
          title: "Помилка з'єднання",
          message:
            "Не вдалося підключитися до сервера NZ.ua або виникли проблеми з інтернетом.",
        });
        closeTabOrWindow(tabId, windowId);
        return;
      }

      const response = results[0].result;
      if (response) {
        chrome.storage.local.get(null, (settings) => {
          if (response.error === "login_required") {
            chrome.notifications.create(
              {
                type: "basic",
                iconUrl: "icon.png",
                title: "Необхідна авторизація на NZ.ua",
                message: "Ви не авторизовані. Будь ласка, увійдіть в систему.",
              },
              (id) => {
                notificationMapping[id] = NZ_NEWS_URL;
              }
            );
            closeTabOrWindow(tabId, windowId);
            return;
          }

          if (response.error === "no_news_block") {
            chrome.notifications.create(
              {
                type: "basic",
                iconUrl: "icon.png",
                title: "Проблема перевірки новин на NZ.ua",
                message: "Блок з новинами не знайдено на сторінці.",
              },
              (id) => {
                notificationMapping[id] = NZ_NEWS_URL;
              }
            );

            closeTabOrWindow(tabId, windowId);
            return;
          }

          if (response.error === "fetch_error") {
            chrome.notifications.create({
              type: "basic",
              iconUrl: "icon.png",
              title: "Помилка отримання даних",
              message: "Виникла проблема під час отримання даних зі сторінки.",
            });

            closeTabOrWindow(tabId, windowId);
            return;
          }

          let currentNews = response;

          chrome.storage.local.get([SAVED_NEWS_KEY], (data) => {
            const savedNews = data[SAVED_NEWS_KEY] || [];

            const newNews = currentNews.filter(
              (newsItem) =>
                !savedNews.some((savedItem) => savedItem.id === newsItem.id)
            );

            if (newNews.length > 0) {
              sendNotificationsWithDelay(newNews, settings);

              chrome.storage.local.set({ [SAVED_NEWS_KEY]: currentNews });
            }
            closeTabOrWindow(tabId, windowId);
          });
        });
      } else {
        chrome.storage.local.get(null, (settings) => {
          chrome.notifications.create(
            {
              type: "basic",
              iconUrl: "icon.png",
              title: "Проблема перевірки новин на NZ.ua",
              message: "Блок з новинами не знайдено на сторінці.",
            },
            (id) => {
              notificationMapping[id] = NZ_NEWS_URL;
            }
          );
        });
        closeTabOrWindow(tabId, windowId);
      }
    }
  );
}

chrome.notifications.onClicked.addListener((id) => {
  const urlToOpen = notificationMapping[id] || NZ_NEWS_URL;
  if (urlToOpen) {
    chrome.tabs.create({ url: urlToOpen });
  }
});

function startNewsCheckCycle() {
  chrome.storage.local.get(["checkInterval"], (data) => {
    const interval = data.checkInterval || 10;
    chrome.alarms.create("newsCheck", {
      periodInMinutes: interval,
    });
  });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "newsCheck") {
    openPage(NZ_NEWS_URL, handleNewsPage);
  }
});

chrome.runtime.onInstalled.addListener(() => {
  openPage(NZ_NEWS_URL, handleNewsPage);
  startNewsCheckCycle();
});

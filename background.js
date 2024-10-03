const SAVED_NEWS_KEY = "savedNZNews";

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

function CreateNewsTab() {
  chrome.storage.local.get(["NEWS_URL_OPEN"], (data) => {
    const url = data.NEWS_URL_OPEN || "https://nz.ua/dashboard/news";
    chrome.tabs.create({ url: url, active: false, index: 0 }, (newTab) => {
      waitForTabLoad(newTab.id);
    });
  });
}

function waitForTabLoad(tabId) {
  chrome.tabs.onUpdated.addListener(function listener(
    tabIdUpdated,
    changeInfo
  ) {
    if (tabId === tabIdUpdated && changeInfo.status === "complete") {
      chrome.tabs.onUpdated.removeListener(listener);
      checkNewsOnTab(tabId);
    }
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendNotificationsWithDelay(newNews, settings) {
  newNews.reverse();

  for (const newsItem of newNews) {
    if (settings.enableChromeNotifications) {
      chrome.notifications.create(
        {
          type: "basic",
          iconUrl: "icon.png",
          title: `Новина від ${newsItem.date}`,
          message: newsItem.text,
        },
        (id) => {
          notificationMapping[id] = `${NEWS_URL_OPEN}`;
        }
      );
    }
    sendTelegramMessage(
      `📚 ${newsItem.date}\n${newsItem.text}\n${NEWS_URL_OPEN}`,
      settings
    );

    await delay(settings.notificationDelay);
  }
}

function checkNewsOnTab(tabId) {
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
        chrome.storage.local.get(null, (settings) => {
          sendTelegramMessage(
            "Не вдалося підключитися до сервера NZ.ua або виникли проблеми з інтернетом.",
            settings
          );
        });
        chrome.tabs.remove(tabId);
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
                notificationMapping[id] =
                  settings.NEWS_URL_OPEN || "https://nz.ua/dashboard/news";
              }
            );
            sendTelegramMessage(
              "Користувач не авторизований. Будь ласка, увійдіть у систему.",
              settings
            );
            chrome.tabs.remove(tabId);
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
                notificationMapping[id] =
                  settings.NEWS_URL_OPEN || "https://nz.ua/dashboard/news";
              }
            );
            sendTelegramMessage(
              "Блок з новинами не знайдено на сторінці.",
              settings
            );
            chrome.tabs.remove(tabId);
            return;
          }

          if (response.error === "fetch_error") {
            chrome.notifications.create({
              type: "basic",
              iconUrl: "icon.png",
              title: "Помилка отримання даних",
              message: "Виникла проблема під час отримання даних зі сторінки.",
            });
            sendTelegramMessage(
              "Виникла проблема під час отримання даних зі сторінки.",
              settings
            );
            chrome.tabs.remove(tabId);
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

              chrome.storage.local.get(["keepTabOpen"], (data) => {
                const keepTabOpen = data.keepTabOpen || false;

                if (keepTabOpen) {
                  chrome.tabs.update(tabId, { active: true });
                } else {
                  chrome.tabs.remove(tabId);
                }
              });
            } else {
              chrome.tabs.remove(tabId);
            }
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
              notificationMapping[id] =
                settings.NEWS_URL_OPEN || "https://nz.ua/dashboard/news";
            }
          );
          sendTelegramMessage(
            "Помилка перевірки новин: блок з новинами не знайдено.",
            settings
          );
        });
        chrome.tabs.remove(tabId);
      }
    }
  );
}

chrome.notifications.onClicked.addListener((id) => {
  chrome.storage.local.get(["NEWS_URL_OPEN"], (data) => {
    const urlToOpen =
      notificationMapping[id] ||
      data.NEWS_URL_OPEN ||
      "https://nz.ua/dashboard/news";
    if (urlToOpen) {
      chrome.tabs.create({ url: urlToOpen });
    }
  });
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
    CreateNewsTab();
  }
});

chrome.runtime.onInstalled.addListener(() => {
  CreateNewsTab();

  startNewsCheckCycle();
});

const SAVED_NEWS_KEY = "savedNZNews";
const DIARY_GRADES_KEY = "diaryGrades";
const NZ_NEWS_URL = "https://nz.ua/dashboard/news";
const NZ_DIARY_URL = "https://nz.ua/schedule/diary";

let notificationMapping = {};

const messageQueue = [];
let isSending = false;

function sendTelegramMessage(message) {
  chrome.storage.local.get(
    ["enableTelegram", "telegramToken", "telegramChatId"],
    (settings) => {
      if (
        !settings.enableTelegram ||
        !settings.telegramToken ||
        !settings.telegramChatId
      ) {
        console.error(
          "Налаштування для Telegram неповні або відправка не дозволена"
        );
        return;
      }

      messageQueue.push({ message, settings });

      if (!isSending) {
        processTelegramQueue();
      }
    }
  );
}

function processTelegramQueue() {
  if (messageQueue.length === 0) {
    isSending = false;
    return;
  }

  isSending = true;
  const { message, settings } = messageQueue.shift();

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
    .catch((error) => console.error("Помилка при виконанні запиту:", error))
    .finally(() => {
      setTimeout(() => {
        processTelegramQueue();
      }, 1000);
    });
}

function closeTabOrWindow(tabId, windowId) {
  if (windowId) {
    chrome.windows.remove(windowId);
  } else {
    chrome.tabs.remove(tabId);
  }
}

function openPage(url, handler) {
  chrome.windows.getAll({ populate: true }, (windows) => {
    const isAnyFullscreen = windows.some((win) => win.state === "fullscreen");

    // if (isAnyFullscreen) {
      openTab(url, handler);
    // } else {
    //   openWindow(url, handler);
    // }
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

// function openWindow(url, handler) {
//   chrome.windows.create(
//     {
//       url: url,
//       type: "popup",
//       focused: false,
//       width: 200,
//       height: 150,
//     },
//     (newWindow) => {
//       const activeTab = newWindow.tabs[0];
//       chrome.tabs.onUpdated.addListener(function listener(
//         tabIdUpdated,
//         changeInfo
//       ) {
//         if (activeTab.id === tabIdUpdated && changeInfo.status === "complete") {
//           chrome.tabs.onUpdated.removeListener(listener);
//           handler(activeTab.id, newWindow.id);
//         }
//       });
//     }
//   );
// }

function genDiaryLink(dateString) {
  const months = {
    січня: "01",
    лютого: "02",
    березня: "03",
    квітня: "04",
    травня: "05",
    червня: "06",
    липня: "07",
    серпня: "08",
    вересня: "09",
    жовтня: "10",
    листопада: "11",
    грудня: "12",
  };

  const [day, month] = dateString.split(" ");

  const year = new Date().getFullYear();

  const monthNumber = months[month];

  const formattedDate = `${year}-${monthNumber}-${day.padStart(2, "0")}`;

  const link = `${NZ_DIARY_URL}?start_date=${formattedDate}`;

  return link;
}

function parseDiaryPage(tabId, savedGrades = [], callback) {
  chrome.scripting.executeScript(
    {
      target: { tabId: tabId },
      function: () => {
        try {
          function extractDate(dateString) {
            const months = [
              "січня",
              "лютого",
              "березня",
              "квітня",
              "травня",
              "червня",
              "липня",
              "серпня",
              "вересня",
              "жовтня",
              "листопада",
              "грудня",
            ];

            const dateRegex = new RegExp(
              `\\d{1,2}\\s+(${months.join("|")})`,
              "i"
            );

            const match = dateString.match(dateRegex);

            if (match) {
              return match[0];
            } else {
              return null;
            }
          }

          const diaryEntries = [];
          const diaryItems = document.querySelectorAll(".diary-item");

          diaryItems.forEach((item) => {
            const date =
              extractDate(
                item.querySelector(".diary-item__title")?.innerText
              ) || null;
            const lessons = Array.from(item.querySelectorAll(".diary-box"));

            lessons.forEach((lesson, index) => {
              const subject =
                lesson.querySelector(".diary-item__label")?.innerText || null;
              const lessonTopic =
                lesson.querySelector(".diary-lesson-text p")?.innerText || null;

              const gradeElement = lesson.querySelector(".diary-add-green");
              const grade = gradeElement?.innerText?.trim() || null;

              const commentElement = lesson.querySelector(
                ".diary-add .tooltiptext"
              );
              const comment = commentElement
                ? commentElement.innerHTML?.trim() || null
                : null;

              const lessonId = `${date}-${index + 1}`;

              if (grade) {
                diaryEntries.push({
                  id: lessonId,
                  date,
                  subject,
                  lessonTopic,
                  grade,
                  comment,
                });
              }
            });
          });

          return diaryEntries;
        } catch (error) {
          return { error: "fetch_error" };
        }
      },
    },
    (results) => {
      if (chrome.runtime.lastError || results[0]?.result?.error) {
        console.error(
          "Помилка при обробці сторінки щоденника:",
          chrome.runtime.lastError || results[0]?.result?.error
        );
        callback([]);
        return;
      }

      const diaryEntries = results[0].result;

      const newEntries = diaryEntries.filter(
        (entry) => !savedGrades.some((savedEntry) => savedEntry.id === entry.id)
      );

      callback(newEntries);
    }
  );
}

function collectDiaryData(startUrl, weeks = 6) {
  chrome.storage.local.get([DIARY_GRADES_KEY], (data) => {
    let savedGrades = data[DIARY_GRADES_KEY] || [];
    let pagesToProcess = weeks;
    let newGrades = [];

    function processPage(tabId, windowId) {
      parseDiaryPage(tabId, savedGrades, (entries) => {
        newGrades.push(...entries);

        if (--pagesToProcess > 0) {
          navigateToPreviousWeek(tabId, () => processPage(tabId, windowId));
        } else {
          chrome.storage.local.set(
            { [DIARY_GRADES_KEY]: [...savedGrades, ...newGrades] },
            () => {
              newGrades.reverse();
              newGrades.forEach((grade) => {
                let message = `Нова оцінка за ${grade.date}\n📘${
                  grade.subject
                }\n [ ${grade.grade} ] ${grade.comment || ""}\n${
                  grade.lessonTopic
                }\n${genDiaryLink(grade.date)}`;

                sendTelegramMessage(message);

                //todo check settings
                chrome.notifications.create({
                  type: "basic",
                  iconUrl: "icon.png",
                  title: `Нова оцінка з предмету ${grade.subject}`,
                  message: `за ${grade.date} Оцінка: ${grade.grade}: ${
                    grade.comment ? "\nКоментар : " + grade.comment : ""
                  }`,
                });
              });
            }
          );
          closeTabOrWindow(tabId, windowId);
        }
      });
    }

    openPage(startUrl, processPage);
  });
}

function navigateToPreviousWeek(tabId, callback) {
  chrome.scripting.executeScript(
    {
      target: { tabId: tabId },
      function: () => {
        document.querySelector(".diary-link-box .pnl-prev").click();
      },
    },
    () => {
      chrome.tabs.onUpdated.addListener(function listener(
        tabIdUpdated,
        changeInfo
      ) {
        if (tabId === tabIdUpdated && changeInfo.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener);
          callback(tabId);
        }
      });
    }
  );
}

function handleHomeworkPage(tabId, windowId = null, newsItem, settings) {
  chrome.scripting.executeScript(
    {
      target: { tabId: tabId },
      function: () => {
        try {
          const title =
            document.querySelector(".hometask__title")?.innerText ||
            "Без заголовку";
          const taskContent =
            document.querySelector(".hometask-answer-content")?.innerText || "";
          const attachment = document
            .querySelector(".hometask-attachments a")
            ?.getAttribute("href");

          const link = window.location.href;

          return { title, taskContent, attachment, link };
        } catch (error) {
          return { error: "fetch_error" };
        }
      },
    },
    (results) => {
      const homeworkDetails = results[0].result;

      if (homeworkDetails) {
        if (!homeworkDetails.taskContent && homeworkDetails.attachment) {
          homeworkDetails.taskContent = "(ДЗ у прикріпленому файлі)";
        }

        const chromeNotificationsEnabled =
          settings.enableChromeNotifications !== false;

        if (chromeNotificationsEnabled) {
          chrome.notifications.create(
            {
              type: "basic",
              iconUrl: "icon.png",
              title: `📖 ${newsItem.date}`,
              message: `Нове завдання: ${homeworkDetails.title}\n${homeworkDetails.taskContent}`,
            },
            (id) => {
              notificationMapping[id] = homeworkDetails.link;
            }
          );
        }

        sendTelegramMessage(
          `📖 ${newsItem.date}\nНове завдання: ${homeworkDetails.title}\n${homeworkDetails.taskContent}\n${homeworkDetails.link}`
        );
      }

      closeTabOrWindow(tabId, windowId);
    }
  );
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

          return Array.from(newsItems).map((item) => {
            const desc =
              item.querySelector(".news-page__desc")?.innerText || "Без опису";
            const date =
              item.querySelector(".news-page__date")?.innerText || "Без дати";
            const homeworkLinkElement = item.querySelector(
              "a[href*='hometask']"
            );
            const homeworkLink = homeworkLinkElement
              ? window.location.origin +
                homeworkLinkElement.getAttribute("href")
              : null;

            return {
              id: item.getAttribute("data-key"),
              text: desc,
              date: date,
              link: homeworkLink || "#",
              isHomework: !!homeworkLink,
            };
          });
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
            // chrome.notifications.create(
            //   {
            //     type: "basic",
            //     iconUrl: "icon.png",
            //     title: "Проблема перевірки новин на NZ.ua",
            //     message: "Блок з новинами не знайдено на сторінці.",
            //   },
            //   (id) => {
            //     notificationMapping[id] = NZ_NEWS_URL;
            //   }
            // );

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
              //якщо є новини - парсимо оцінки
              collectDiaryData(NZ_DIARY_URL, 4);

              newNews.reverse();

       

              for (const newsItem of newNews) {
                if (newsItem.isHomework) {
                  openPage(newsItem.link, (homeworkTabId, homeworkWindowId) => {
                    handleHomeworkPage(
                      homeworkTabId,
                      homeworkWindowId,
                      newsItem,
                      settings
                    );
                  });
                } else {
                  if (settings.enableChromeNotifications !== false) {
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
                    `📚 ${newsItem.date}\n${newsItem.text}\n${NZ_NEWS_URL}`
                  );
                }
              }

              chrome.storage.local.set({ [SAVED_NEWS_KEY]: currentNews });
            }
            closeTabOrWindow(tabId, windowId);
          });
        });
      } else {
        // chrome.notifications.create(
        //   {
        //     type: "basic",
        //     iconUrl: "icon.png",
        //     title: "Проблема перевірки новин на NZ.ua",
        //     message: "Блок з новинами не знайдено на сторінці.",
        //   },
        //   (id) => {
        //     notificationMapping[id] = NZ_NEWS_URL;
        //   }
        // );

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

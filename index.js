const fs = require('fs');
const { Telegraf, Markup } = require('telegraf');
const mineflayer = require('mineflayer');

// ───────────────────────── Настройки ─────────────────────────
const BOT_TOKEN = process.env.BOT_TOKEN || 'ВСТАВЬ_ТОКЕН_СЮДА';
const CLIENT_URL =
  'https://drive.google.com/file/d/1FGDAIi0GWGhqBenz0Tyxrp7gexopUgVW/view?usp=sharing';

// null = mineflayer определит версию сама. Можно указать, например, '1.21.11'
const MC_VERSION = null;
// 'offline' для пиратских серверов, 'microsoft' для лицензии
const MC_AUTH = 'offline';
const RECONNECT_DELAY = 15000;
const SETTINGS_FILE = 'settings.json';
// ──────────────────────────────────────────────────────────────

const bot = new Telegraf(BOT_TOKEN);

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ───────────────────── Хранилище настроек ─────────────────────
function loadAll() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function getSettings(uid) {
  const d = loadAll()[uid] || {};
  return {
    nick: d.nick || `Afk${uid % 10000}`,
    host: d.host || '',
    port: d.port || 25565,
    password: d.password || '',
  };
}

function setSetting(uid, key, value) {
  const all = loadAll();
  all[uid] = { ...(all[uid] || {}), [key]: value };
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(all, null, 2), 'utf-8');
}

// ───────────────────────── Клавиатуры ─────────────────────────
const mainKb = () =>
  Markup.inlineKeyboard([
    [Markup.button.url('⬇️ Установить клиент', CLIENT_URL)],
    [Markup.button.callback('🤖 Создать бота', 'create')],
  ]);

const menuKb = () =>
  Markup.inlineKeyboard([
    [Markup.button.callback('✏️ Изменить ник', 'edit:nick')],
    [Markup.button.callback('🔌 Изменить порт', 'edit:port')],
    [Markup.button.callback('🌐 Изменить айпи', 'edit:host')],
    [Markup.button.callback('🔑 Изменить пароль', 'edit:password')],
    [Markup.button.callback('⬅️ Назад', 'back')],
  ]);

const cancelKb = () =>
  Markup.inlineKeyboard([[Markup.button.callback('✖️ Отмена', 'create')]]);

function startText(user) {
  const name = user.username
    ? `@${user.username}`
    : [user.first_name, user.last_name].filter(Boolean).join(' ');
  return `Привет, ${esc(name)}! Чтобы установить клиент, нажми на кнопку ниже.`;
}

function menuText(uid) {
  const s = getSettings(uid);
  return (
    '🤖 <b>Настройки бота</b>\n\n' +
    `Ник: <code>${esc(s.nick)}</code>\n` +
    `IP: <code>${s.host ? esc(s.host) : 'не задан'}</code>\n` +
    `Порт: <code>${s.port}</code>\n` +
    `Пароль: ${s.password ? '✅ задан' : 'не задан'}\n\n` +
    'Выбери, что изменить.\n' +
    'Команды: /join — запустить бота, /say текст — написать в чат, /stop — выключить.'
  );
}

const HTML = { parse_mode: 'HTML' };
const withKb = (kb) => ({ ...HTML, ...kb });

async function safeEdit(ctx, text, kb) {
  try {
    await ctx.editMessageText(text, withKb(kb));
  } catch (e) {
    // «message is not modified» и т.п. — не страшно
  }
}

// ───────────────────── Telegram: меню и ввод ─────────────────────
const PROMPTS = {
  nick: 'Напиши новый ник (3–16 символов: латиница, цифры, _):',
  port: 'Напиши новый порт (число от 1 до 65535):',
  host: 'Напиши новый айпи или домен сервера (без порта):',
  password:
    'Напиши новый пароль для /login (чтобы убрать пароль, отправь «-»):',
};
const DONE = {
  nick: '✅ Ник изменён.',
  port: '✅ Порт изменён.',
  host: '✅ Айпи изменён.',
  password: '✅ Пароль изменён.',
};

// uid -> поле, которое сейчас ждём от пользователя
const awaiting = new Map();

function validate(field, raw) {
  const text = raw.trim();
  if (field === 'nick') {
    if (!/^[A-Za-z0-9_]{3,16}$/.test(text))
      return { error: '❌ Ник должен быть 3–16 символов: латиница, цифры, _.' };
    return { value: text };
  }
  if (field === 'port') {
    const n = Number(text);
    if (!/^\d+$/.test(text) || n < 1 || n > 65535)
      return { error: '❌ Порт — число от 1 до 65535.' };
    return { value: n };
  }
  if (field === 'host') {
    if (!text || /\s/.test(text) || text.length > 253)
      return { error: '❌ Айпи/домен не должен содержать пробелов.' };
    if (text.includes(':'))
      return {
        error: '❌ Порт указывается отдельной кнопкой, напиши только айпи или домен.',
      };
    return { value: text.toLowerCase() };
  }
  if (field === 'password') {
    if (!text || text.length > 100)
      return { error: '❌ Пароль не должен быть пустым (или отправь «-», чтобы убрать).' };
    return { value: text === '-' ? '' : text };
  }
  return { error: '❌ Неизвестное поле.' };
}

bot.start(async (ctx) => {
  awaiting.delete(ctx.from.id);
  await ctx.reply(startText(ctx.from), withKb(mainKb()));
});

bot.action('create', async (ctx) => {
  awaiting.delete(ctx.from.id);
  await safeEdit(ctx, menuText(ctx.from.id), menuKb());
  await ctx.answerCbQuery();
});

bot.action('back', async (ctx) => {
  awaiting.delete(ctx.from.id);
  await safeEdit(ctx, startText(ctx.from), mainKb());
  await ctx.answerCbQuery();
});

bot.action(/^edit:(nick|port|host|password)$/, async (ctx) => {
  const field = ctx.match[1];
  awaiting.set(ctx.from.id, field);
  await safeEdit(ctx, PROMPTS[field], cancelKb());
  await ctx.answerCbQuery();
});

// ───────────────────────── Minecraft ─────────────────────────
const sessions = new Map(); // uid -> { bot, stopped }

function notify(uid, text) {
  bot.telegram.sendMessage(uid, text, HTML).catch(() => {});
}

function connect(session) {
  const uid = session.uid;
  const s = getSettings(uid);

  const options = {
    host: s.host,
    port: s.port,
    username: s.nick,
    auth: MC_AUTH,
  };
  if (MC_VERSION) options.version = MC_VERSION;

  const mc = mineflayer.createBot(options);
  session.bot = mc;

  mc.once('spawn', () => {
    notify(uid, `✅ Бот ${esc(s.nick)} зашёл на сервер ${esc(s.host)}!`);
    if (s.password) setTimeout(() => mc.chat(`/login ${s.password}`), 3000);
  });

  mc.on('chat', (username, message) => {
    if (username === s.nick) return;
    notify(uid, `💬 [${esc(username)}]: ${esc(message)}`);
  });

  mc.on('error', (err) => {
    notify(uid, `❗ Ошибка: ${esc(err.message || err)}`);
  });

  mc.on('end', (reason) => {
    if (session.stopped || sessions.get(uid) !== session) return;
    notify(
      uid,
      `⚠️ Бот отключён от сервера. Причина: ${esc(reason)}. ` +
        `Переподключение через ${RECONNECT_DELAY / 1000} сек...`
    );
    setTimeout(() => {
      if (session.stopped || sessions.get(uid) !== session) return;
      try {
        connect(session);
      } catch (e) {
        notify(uid, `❗ Не удалось переподключиться: ${esc(e.message || e)}`);
      }
    }, RECONNECT_DELAY);
  });
}

// ───────────────────────── Команды управления ─────────────────────────
bot.command('join', async (ctx) => {
  const uid = ctx.from.id;
  if (sessions.has(uid)) return ctx.reply('Бот уже запущен. Остановить: /stop');

  const s = getSettings(uid);
  if (!s.host)
    return ctx.reply(
      'Сначала задай айпи сервера: /start → «Создать бота» → «Изменить айпи».'
    );

  const session = { uid, bot: null, stopped: false };
  sessions.set(uid, session);
  await ctx.reply(
    `Запускаю бота <code>${esc(s.nick)}</code> на <code>${esc(s.host)}:${s.port}</code>...`,
    HTML
  );
  try {
    connect(session);
  } catch (e) {
    sessions.delete(uid);
    await ctx.reply(`❗ Не удалось запустить: ${esc(e.message || e)}`, HTML);
  }
});

bot.command('say', async (ctx) => {
  const session = sessions.get(ctx.from.id);
  if (!session || !session.bot) return ctx.reply('Бот не запущен. Запусти: /join');

  const text = ctx.message.text.replace(/^\/say(@\w+)?\s*/, '');
  if (!text) return ctx.reply('Использование: /say текст');

  session.bot.chat(text);
  await ctx.reply(`Сообщение отправлено: ${esc(text)}`, HTML);
});

bot.command('stop', async (ctx) => {
  const session = sessions.get(ctx.from.id);
  if (!session) return ctx.reply('Бот не запущен.');

  session.stopped = true;
  sessions.delete(ctx.from.id);
  try {
    session.bot.quit();
  } catch {}
  await ctx.reply('❌ Бот остановлен.');
});

// ───────────── Ввод значения (после нажатия кнопки меню) ─────────────
bot.on('text', async (ctx) => {
  const uid = ctx.from.id;
  const field = awaiting.get(uid);
  if (!field || ctx.message.text.startsWith('/')) return;

  const { value, error } = validate(field, ctx.message.text);
  if (error) {
    return ctx.reply(`${error}\nПопробуй ещё раз:`, cancelKb());
  }

  setSetting(uid, field, value);
  awaiting.delete(uid);

  if (field === 'password') {
    try {
      await ctx.deleteMessage(); // убираем пароль из переписки
    } catch {}
  }

  await ctx.reply(`${DONE[field]}\n\n${menuText(uid)}`, withKb(menuKb()));
});

// ───────────────────────── Запуск ─────────────────────────
bot.catch((err) => console.error('Ошибка бота:', err));

bot.launch();
console.log('Telegram-бот запущен');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

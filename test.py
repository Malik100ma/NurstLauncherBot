import asyncio
import html
import logging
import os

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.filters import CommandStart
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, Message

BOT_TOKEN = os.getenv("BOT_TOKEN", "9031755949:AAGie6xILjCnNRvloodFavEBqcEcO1kFykI")
CLIENT_URL = "https://drive.google.com/file/d/1FGDAIi0GWGhqBenz0Tyxrp7gexopUgVW/view?usp=sharing"

dp = Dispatcher()


@dp.message(CommandStart())
async def cmd_start(message: Message) -> None:
    user = message.from_user
    if user.username:
        name = f"@{user.username}"
    else:
        name = user.full_name
    name = html.escape(name)

    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="⬇️ Установить клиент", url=CLIENT_URL)]
        ]
    )

    await message.answer(
        f"Привет, {name}! Чтобы установить клиент, нажми на кнопку ниже.",
        reply_markup=keyboard,
    )


async def main() -> None:
    logging.basicConfig(level=logging.INFO)
    bot = Bot(token=BOT_TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())

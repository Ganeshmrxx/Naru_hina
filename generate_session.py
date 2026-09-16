import asyncio
asyncio.set_event_loop(asyncio.new_event_loop())

import sys
sys.stdout.reconfigure(encoding='utf-8')
sys.path.append(r"e:\Ganesh\ANIGRAVITY\allforward")

from pyrogram import Client
from config import Config

async def main():
    phone = input("Enter Phone Number with country code (e.g. +919876543210): ").strip()
    app = Client(
        "session_generator",
        api_id=Config.API_ID2,
        api_hash=Config.API_HASH2,
        in_memory=True
    )
    await app.connect()
    
    print(f"Sending login code to {phone} on Telegram...")
    sent_code = await app.send_code(phone)
    phone_code = input("Enter the OTP code received in Telegram: ").strip()
    
    try:
        signed_in = await app.sign_in(phone, sent_code.phone_code_hash, phone_code)
    except Exception as e:
        if "SESSION_PASSWORD_NEEDED" in str(e):
            password = input("2-Step Verification Password required. Enter password: ").strip()
            signed_in = await app.check_password(password)
        else:
            raise e
            
    session_string = await app.export_session_string()
    me = await app.get_me()
    print("\n" + "="*50)
    print(f"SUCCESS! Logged in as: {me.first_name} (@{me.username}) ID: {me.id}")
    print("="*50)
    
    # Save to file
    with open("new_session.txt", "w", encoding="utf-8") as f:
        f.write(session_string)
        
    # Update config.py automatically
    config_path = r"e:\Ganesh\ANIGRAVITY\allforward\config.py"
    with open(config_path, "r", encoding="utf-8") as f:
        content = f.read()
    import re
    new_content = re.sub(r'SESSION2\s*=\s*"[^"]*"', f'SESSION2="{session_string}"', content)
    with open(config_path, "w", encoding="utf-8") as f:
        f.write(new_content)
    print("Updated SESSION2 in config.py!")
    
    await app.disconnect()
    
    print("\nAutomatically applying Telegram Chat Folders...")
    import setup_telegram_folders
    await setup_telegram_folders.main()
    print("\nALL FOLDERS ARE NOW LIVE ON TELEGRAM!")

if __name__ == "__main__":
    asyncio.run(main())

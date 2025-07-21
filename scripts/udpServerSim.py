"""
UDP ESP32 simulator
Listens on 0.0.0.0:8080, replies to the *exact* sender in two steps:
1) 0x01 (activated) immediately
2) 0x00 (released)  one second later
"""
import socket, time, struct, sys

HOST = ""        # 0.0.0.0 – listen on all interfaces
PORT = 8050

with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
    sock.bind((HOST, PORT))
    print(f"[UDP-SIM] 📡 Listening on {PORT} …")

    while True:
        data, addr = sock.recvfrom(1024)
        print(f"[{time.strftime('%H:%M:%S')}] 📥 Trigger from {addr}: {data.hex()}")

        # 1) activated
        sock.sendto(b"\x01", addr)
        print(f"[{time.strftime('%H:%M:%S')}] 📤 Sent 0x01 (activated) → {addr}")

        # 2) released after 1 s
        time.sleep(0.5)
        sock.sendto(b"\x00", addr)
        print(f"[{time.strftime('%H:%M:%S')}] 📤 Sent 0x00 (released)  → {addr}")
        print("-" * 45)

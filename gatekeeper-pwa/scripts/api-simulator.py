#!/usr/bin/env python3
"""
ESP32 HTTP API Simulator for Gatekeeper PWA Testing

This script simulates the ESP32 HTTP API endpoint that the Gatekeeper PWA expects.
It provides a POST /trigger endpoint that responds with 200 OK, just like the real ESP32.

Usage:
    python3 scripts/api-simulator.py [--port PORT] [--host HOST]

Default: http://localhost:8080
Configure your PWA to use: localhost:8080 (or your specified host:port)
"""

import argparse
import json
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse


class GatekeeperAPIHandler(BaseHTTPRequestHandler):
    """HTTP request handler that simulates ESP32 gate trigger API"""
    
    def do_POST(self):
        """Handle POST requests to /trigger endpoint"""
        parsed_path = urlparse(self.path)
        
        if parsed_path.path == '/trigger':
            self.handle_trigger()
        else:
            self.send_error(404, "Endpoint not found")
    
    def do_OPTIONS(self):
        """Handle CORS preflight requests"""
        self.send_response(200)
        self.send_cors_headers()
        self.end_headers()
    
    def handle_trigger(self):
        """Simulate gate trigger - responds like real ESP32"""
        print(f"[{time.strftime('%H:%M:%S')}] Gate trigger received from {self.client_address[0]}")
        
        # Simulate brief processing delay (like real ESP32)
        time.sleep(0.1)
        
        # Send success response (matches ESP32 behavior)
        self.send_response(200)
        self.send_cors_headers()
        self.send_header('Content-Type', 'text/plain')
        self.end_headers()
        self.wfile.write(b'OK')
        
        print(f"[{time.strftime('%H:%M:%S')}] Gate trigger response sent: 200 OK")
    
    def send_cors_headers(self):
        """Send CORS headers for web browser compatibility"""
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
    
    def log_message(self, format, *args):
        """Override to reduce verbose logging"""
        pass  # Suppress default request logging


def main():
    """Start the API simulator server"""
    parser = argparse.ArgumentParser(description='ESP32 API Simulator for Gatekeeper PWA')
    parser.add_argument('--port', type=int, default=8080, 
                       help='Port to run server on (default: 8080)')
    parser.add_argument('--host', type=str, default='localhost',
                       help='Host to bind to (default: localhost)')
    
    args = parser.parse_args()
    
    server_address = (args.host, args.port)
    httpd = HTTPServer(server_address, GatekeeperAPIHandler)
    
    print("🚪 Gatekeeper ESP32 API Simulator")
    print("=" * 40)
    print(f"Server running at: http://{args.host}:{args.port}")
    print(f"Trigger endpoint: http://{args.host}:{args.port}/trigger")
    print("Configure your PWA to use this host:port")
    print("Press Ctrl+C to stop")
    print("=" * 40)
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n🛑 Server stopped")
        httpd.server_close()


if __name__ == '__main__':
    main()
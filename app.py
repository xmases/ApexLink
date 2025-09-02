from flask import Flask, render_template, request, jsonify
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from database import init_db, insert_order, get_order_by_hash
import sqlite3
import json
from Crypto.PublicKey import RSA
from Crypto.Cipher import PKCS1_OAEP
import base64
import os

app = Flask(__name__)
init_db()

# Limiter setup
limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=[]
)

# Load public RSA key once
PUBLIC_KEY_PATH = os.path.join(os.path.dirname(__file__), 'public.pem')
def encrypt_address(address, public_key_path=PUBLIC_KEY_PATH):
    with open(public_key_path, 'rb') as f:
        key = RSA.import_key(f.read())
    cipher = PKCS1_OAEP.new(key)
    encrypted_bytes = cipher.encrypt(address.encode('utf-8'))
    return base64.b64encode(encrypted_bytes).decode('utf-8')

@app.route('/legal')
def legal():
    return render_template('legal.html')

@app.route('/pay/<order_hash>')
def payment_page(order_hash):
    conn = sqlite3.connect('orders.db')
    cursor = conn.cursor()
    cursor.execute('SELECT payment_address FROM orders WHERE hash = ?', (order_hash,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        return "Order not found", 404

    try:
        addresses = json.loads(row[0])
    except Exception:
        addresses = {"solana": "not_set", "monero": "not_set", "usd_price": "unknown"}

    return render_template('payment_page.html', hash=order_hash, addresses=addresses)

@app.route('/help')
def help_page():
    return render_template('help.html')

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/save-order', methods=['POST'])
@limiter.limit("3 per minute", override_defaults=False)
def save_order():
    try:
        data = request.get_json()
        print("Received data:", data)

        if not data or 'hash' not in data:
            return 'Missing hash', 400

        # CHECK MODE
        if data.get('link') is None and data.get('address') in (None, "") and data.get('email') in (None, ""):
            order = get_order_by_hash(data['hash'].lower())
            if not order:
                return 'Order not found', 404
            return jsonify({
                'link': order[0],
                'timestamp': order[1],
                'hash': order[2],
                'status': order[3],
                'payment_address': order[4],
                'email': order[5]
            })

        # SUBMIT MODE
        link = data.get('link')
        timestamp = data.get('timestamp')
        order_hash = data.get('hash')
        address = data.get('address', '')
        email = data.get('email', '')

        if address:
            try:
                address = encrypt_address(address)
            except Exception as e:
                print("Encryption failed:", e)
                return 'Encryption failed', 500

        insert_order(link, timestamp, order_hash, address, email)
        print("Order inserted successfully")
        return 'Order saved', 200

    except Exception as e:
        print("Insert failed:", e)
        return f'Insert failed: {e}', 500

@app.errorhandler(429)
def ratelimit_handler(e):
    return jsonify({"error": "🚫 Too many submissions. Please wait a minute before sending a new order."}), 429

if __name__ == '__main__':
    app.run()

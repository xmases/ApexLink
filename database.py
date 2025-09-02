import sqlite3

DB_NAME = 'orders.db'

def init_db():
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            link TEXT,
            timestamp TEXT,
            hash TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            payment_address TEXT NOT NULL DEFAULT 'not_assigned',
            delivery_address TEXT,
            email TEXT
        )
    ''')
    conn.commit()
    conn.close()

def insert_order(link, timestamp, order_hash, address, email, status='pending', payment_address='not_assigned'):
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO orders (link, timestamp, hash, status, payment_address, delivery_address, email)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (link, timestamp, order_hash, status, payment_address, address, email))
    conn.commit()
    conn.close()


def get_order_by_hash(order_hash):
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    cursor.execute('SELECT link, timestamp, hash, status, payment_address, email FROM orders WHERE hash = ?', (order_hash,))
    row = cursor.fetchone()
    conn.close()
    return row


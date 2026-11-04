"""Reseed QLSP database with UTF-8 encoding from SQLQuery1.sql and SQLQuery2.sql."""

import os
from pathlib import Path
import re
import pyodbc
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / "backend" / ".env")

server = os.getenv("DB_SERVER", r".\SQLEXPRESS01")
driver = os.getenv("DB_DRIVER", "ODBC Driver 17 for SQL Server")

print(f"Connecting to SQL Server master on {server} using {driver}...")
conn_str = (
    f"DRIVER={{{driver}}};"
    f"SERVER={server};"
    "DATABASE=master;"
    "Trusted_Connection=yes;"
    "TrustServerCertificate=yes;"
)

conn = pyodbc.connect(conn_str, autocommit=True)
cursor = conn.cursor()

print("Dropping existing QLSP database if present...")
cursor.execute("""
IF DB_ID('QLSP') IS NOT NULL
BEGIN
    ALTER DATABASE [QLSP] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE [QLSP];
END
""")

def run_script(path):
    print(f"Executing {path.name} (UTF-8)...")
    content = path.read_text(encoding="utf-8")
    batches = re.split(r"^\s*GO\s*$", content, flags=re.MULTILINE | re.IGNORECASE)
    for batch in batches:
        cmd = batch.strip()
        if cmd:
            cursor.execute(cmd)

run_script(BASE_DIR / "database" / "SQLQuery1.sql")
run_script(BASE_DIR / "database" / "SQLQuery2.sql")

cursor.execute("USE QLSP")
cursor.execute("SELECT COUNT(*) FROM products")
count = cursor.fetchone()[0]
print(f"Successfully reseeded QLSP with {count} products (UTF-8 encoded)!")

cursor.close()
conn.close()


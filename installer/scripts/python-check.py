"""File entry point: avoid Windows PowerShell 5.1 stripping quotes from -c."""
import ssl
import sqlite3
import zlib
import zoneinfo
import pypdf
import xlrd
from PIL import Image

assert ssl.OPENSSL_VERSION
assert sqlite3.connect(':memory:').execute('SELECT 1').fetchone() == (1,)
assert zlib.decompress(zlib.compress(b'guardia')) == b'guardia'
assert Image.new('RGB', (1, 1)).size == (1, 1)
print('Bibliotecas Python: SSL, SQLite, compresion, PDF, Excel e imagenes OK')

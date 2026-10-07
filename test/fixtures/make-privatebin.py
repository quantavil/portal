"""Generates test/fixtures/privatebin.json: a PrivateBin-style encrypted paste, built independently of the TS decryptor.
Run: python3 test/fixtures/make-privatebin.py   (needs `pip install cryptography`)"""
import base64, hashlib, json, os, zlib
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
def b58encode(b: bytes) -> str:
    n = int.from_bytes(b, "big"); s = ""
    while n: n, r = divmod(n, 58); s = B58[r] + s
    return "1" * (len(b) - len(b.lstrip(b"\0"))) + s

paste = """# ► Adult Streaming

## ▷ Tubes

* ⭐ **[Example Tube](https://tube.example/)**, [2](https://tube2.example/) - Videos / Free / [Discord](https://discord.example/x)
* [Another Site](https://another.example/path_(x)) - Clips

# ► Comics

* [Comic Place](https://comics.example/) - Webcomics / Ünïcödé
"""
secret_bytes = os.urandom(32); secret = b58encode(secret_bytes); password = "hunter2"
iv = os.urandom(12); salt = os.urandom(8); iters = 10000
adata = [[base64.b64encode(iv).decode(), base64.b64encode(salt).decode(), iters, 256, 128, "aes", "gcm", "zlib"], "plaintext", 1, 0]
key = hashlib.pbkdf2_hmac("sha256", secret_bytes + password.encode(), salt, iters, dklen=32)
co = zlib.compressobj(wbits=-15); data = co.compress(json.dumps({"paste": paste}).encode()) + co.flush()
aad = json.dumps(adata, separators=(",", ":")).encode()
ct = AESGCM(key).encrypt(iv, data, aad)
out = {"payload": {"v": 2, "adata": adata, "ct": base64.b64encode(ct).decode(), "meta": {"expire": "never"}}, "secret": secret, "password": password, "expected": paste}
json.dump(out, open("test/fixtures/privatebin.json", "w"), ensure_ascii=False, indent=1)
print("ok", secret)

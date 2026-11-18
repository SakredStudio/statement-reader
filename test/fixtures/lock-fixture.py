# Writes a password-locked copy of the MADE-UP sample statement, to test the password prompt.
# Dev-only helper: needs Python with pypdf (and cryptography for AES). The password is not a secret.
#   python test/fixtures/lock-fixture.py
from pathlib import Path
from pypdf import PdfReader, PdfWriter

here = Path(__file__).parent
reader = PdfReader(here / "mpesa-ke-sample.pdf")
writer = PdfWriter()
for page in reader.pages:
    writer.add_page(page)
writer.encrypt(user_password="000000", algorithm="AES-256")
with open(here / "mpesa-ke-sample-locked.pdf", "wb") as fh:
    writer.write(fh)
print("wrote mpesa-ke-sample-locked.pdf")

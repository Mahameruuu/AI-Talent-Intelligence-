"""Entry point: ``python wsgi.py`` (dev server on :5001) or ``flask --app wsgi run``."""

import os

from app import create_app, recover_background_jobs

app = create_app()
recover_background_jobs(app)

if __name__ == "__main__":
    # Threaded so status polling stays responsive while CVs are processed in the background.
    app.run(host="127.0.0.1", port=int(os.getenv("PORT", "5001")), debug=False, threaded=True)

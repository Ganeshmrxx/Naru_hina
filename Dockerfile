FROM python:3.11.7

RUN apt-get update && apt-get upgrade -y && \
    apt-get install -y --no-install-recommends git && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /SilentXBotz

COPY requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip --root-user-action=ignore && \
    pip install --no-cache-dir -r requirements.txt --root-user-action=ignore

COPY . .

ENV PORT=8080
ENV API_PORT=8081

CMD ["python3", "bot.py"]

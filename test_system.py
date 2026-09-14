import os
import sys

# Add directory to sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from fastapi.testclient import TestClient
from api_server import app, ADMIN_USERNAME, ADMIN_PASSWORD

client = TestClient(app)

def test_api_health():
    print("Testing /api/health...")
    resp = client.get("/api/health")
    assert resp.status_code == 200, f"Health check failed: {resp.text}"
    data = resp.json()
    assert data["status"] == "healthy"
    assert "total_bots" in data
    print("  [OK] /api/health passed:", data)

def test_auth():
    print("\nTesting Authentication...")
    # 1. Invalid login
    resp = client.post("/api/auth/login", json={"username": "wrong", "password": "wrong"})
    assert resp.status_code == 401, "Expected 401 for bad credentials"
    print("  [OK] Bad credentials rejected (401)")

    # 2. Valid login
    resp = client.post("/api/auth/login", json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD})
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    token_data = resp.json()
    assert "access_token" in token_data
    token = token_data["access_token"]
    print("  [OK] Login successful, token received")

    # 3. Unauthorized access to protected route
    resp = client.get("/api/bots")
    assert resp.status_code == 403 or resp.status_code == 401, "Expected 401/403 for unauthenticated request"
    print("  [OK] Unauthenticated request protected")

    # 4. Authorized access with token
    headers = {"Authorization": f"Bearer {token}"}
    resp = client.get("/api/bots", headers=headers)
    assert resp.status_code == 200, f"Protected route failed: {resp.text}"
    bots = resp.json()
    assert len(bots) == 6, f"Expected 6 bots, got {len(bots)}"
    print(f"  [OK] Authenticated request passed, found {len(bots)} bots: {list(bots.keys())}")
    return headers

def test_endpoints(headers):
    print("\nTesting Core REST Endpoints...")
    
    # /api/stats
    resp = client.get("/api/stats", headers=headers)
    assert resp.status_code == 200
    print("  [OK] /api/stats:", resp.json().get("date"))

    # /api/forwarding/chats
    resp = client.get("/api/forwarding/chats", headers=headers)
    assert resp.status_code == 200
    print(f"  [OK] /api/forwarding/chats returned {len(resp.json())} items")

    # /api/mappings
    resp = client.get("/api/mappings", headers=headers)
    assert resp.status_code == 200
    print(f"  [OK] /api/mappings returned {len(resp.json())} items")

    # /api/terabox/config
    resp = client.get("/api/terabox/config", headers=headers)
    assert resp.status_code == 200
    print("  [OK] /api/terabox/config:", list(resp.json().keys()))

    # /api/database/status
    resp = client.get("/api/database/status", headers=headers)
    assert resp.status_code == 200
    print("  [OK] /api/database/status:", list(resp.json().keys()))

    # /api/logs
    resp = client.get("/api/logs", headers=headers)
    assert resp.status_code == 200
    print(f"  [OK] /api/logs returned {len(resp.json())} log entries")

if __name__ == "__main__":
    print("=== Starting AllForward API Verification ===")
    test_api_health()
    headers = test_auth()
    test_endpoints(headers)
    print("\n=== All Verification Tests Passed Successfully! ===")

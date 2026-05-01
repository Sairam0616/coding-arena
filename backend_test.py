#!/usr/bin/env python3
"""
Backend test for AI Coding Practice Arena - Phase 2
Tests auth, ads, admin, templates, hints, streaming, share, leaderboard, history
"""
import requests
import json
import time
import sys

BASE_URL = "https://practice-judge.preview.emergentagent.com/api"

def log(msg):
    print(f"[TEST] {msg}")

def test_section(name):
    print(f"\n{'='*80}")
    print(f"SECTION: {name}")
    print(f"{'='*80}")

def assert_status(response, expected, context=""):
    if response.status_code != expected:
        log(f"❌ FAIL {context}: Expected {expected}, got {response.status_code}")
        log(f"Response: {response.text[:500]}")
        return False
    log(f"✅ Status {expected} {context}")
    return True

def assert_field(data, field, context=""):
    if field not in data:
        log(f"❌ FAIL {context}: Missing field '{field}'")
        return False
    log(f"✅ Field '{field}' present {context}")
    return True

# ============================================================================
# SECTION 1: PUBLIC ENDPOINTS (no auth)
# ============================================================================
def test_public_endpoints():
    test_section("1) PUBLIC ENDPOINTS (no auth)")
    
    # Health check
    log("Testing GET /health")
    r = requests.get(f"{BASE_URL}/health")
    if not assert_status(r, 200, "health check"): return False
    data = r.json()
    if not assert_field(data, "status", "health"): return False
    if data["status"] != "ok":
        log(f"❌ FAIL: Expected status='ok', got '{data['status']}'")
        return False
    log("✅ Health check passed")
    
    # Templates
    log("Testing GET /templates")
    r = requests.get(f"{BASE_URL}/templates")
    if not assert_status(r, 200, "templates"): return False
    data = r.json()
    if not assert_field(data, "templates", "templates"): return False
    if len(data["templates"]) != 8:
        log(f"❌ FAIL: Expected 8 templates, got {len(data['templates'])}")
        return False
    log(f"✅ Templates count: {len(data['templates'])}")
    
    # Auth/me without cookie
    log("Testing GET /auth/me (no cookie)")
    r = requests.get(f"{BASE_URL}/auth/me")
    if not assert_status(r, 200, "auth/me no cookie"): return False
    data = r.json()
    if data.get("user") is not None:
        log(f"❌ FAIL: Expected user=null, got {data.get('user')}")
        return False
    log("✅ Auth/me returns user=null without cookie")
    
    log("✅✅✅ SECTION 1 PASSED")
    return True

# ============================================================================
# SECTION 2: AUTH
# ============================================================================
def test_auth():
    test_section("2) AUTH")
    
    # Signup admin
    log("Testing POST /auth/signup (admin)")
    session1 = requests.Session()
    r = session1.post(f"{BASE_URL}/auth/signup", json={
        "email": "admin@test.com",
        "password": "adminpass",
        "name": "Admin"
    })
    if not assert_status(r, 200, "signup admin"): return False, None, None
    data = r.json()
    if not assert_field(data, "user", "signup admin"): return False, None, None
    if not assert_field(data, "needs_ads", "signup admin"): return False, None, None
    if not data["user"].get("is_admin"):
        log(f"❌ FAIL: First user should be admin, got is_admin={data['user'].get('is_admin')}")
        return False, None, None
    log(f"✅ Admin user created: {data['user']['email']}, is_admin={data['user']['is_admin']}")
    
    # Check cookie set
    cookies = session1.cookies.get_dict()
    if "arena_token" not in cookies:
        log("❌ FAIL: Cookie 'arena_token' not set")
        return False, None, None
    log("✅ Cookie 'arena_token' set")
    
    # Auth/me with session1
    log("Testing GET /auth/me (with admin session)")
    r = session1.get(f"{BASE_URL}/auth/me")
    if not assert_status(r, 200, "auth/me admin"): return False, None, None
    data = r.json()
    if not data.get("user", {}).get("is_admin"):
        log(f"❌ FAIL: Expected is_admin=true, got {data.get('user', {}).get('is_admin')}")
        return False, None, None
    log(f"✅ Auth/me returns admin user, needs_ads={data.get('needs_ads')}")
    
    # Signup regular user
    log("Testing POST /auth/signup (regular user)")
    session2 = requests.Session()
    r = session2.post(f"{BASE_URL}/auth/signup", json={
        "email": "user@test.com",
        "password": "userpass",
        "name": "User"
    })
    if not assert_status(r, 200, "signup user"): return False, None, None
    data = r.json()
    if data["user"].get("is_admin"):
        log(f"❌ FAIL: Second user should NOT be admin, got is_admin={data['user'].get('is_admin')}")
        return False, None, None
    log(f"✅ Regular user created: {data['user']['email']}, is_admin={data['user']['is_admin']}")
    
    # Re-login admin
    log("Testing POST /auth/login (admin)")
    r = session1.post(f"{BASE_URL}/auth/login", json={
        "email": "admin@test.com",
        "password": "adminpass"
    })
    if not assert_status(r, 200, "login admin"): return False, None, None
    log("✅ Admin re-login successful")
    
    # Logout test
    log("Testing POST /auth/logout")
    temp_session = requests.Session()
    r = temp_session.post(f"{BASE_URL}/auth/signup", json={
        "email": "temp@test.com",
        "password": "temppass",
        "name": "Temp"
    })
    if not assert_status(r, 200, "signup temp"): return False, None, None
    r = temp_session.post(f"{BASE_URL}/auth/logout")
    if not assert_status(r, 200, "logout"): return False, None, None
    r = temp_session.get(f"{BASE_URL}/auth/me")
    data = r.json()
    if data.get("user") is not None:
        log(f"❌ FAIL: After logout, expected user=null, got {data.get('user')}")
        return False, None, None
    log("✅ Logout successful, auth/me returns user=null")
    
    log("✅✅✅ SECTION 2 PASSED")
    return True, session1, session2

# ============================================================================
# SECTION 3: AUTH-PROTECTED FLOW UNAUTHORIZED
# ============================================================================
def test_unauthorized():
    test_section("3) AUTH-PROTECTED FLOW UNAUTHORIZED")
    
    no_auth = requests.Session()
    
    # GET /tests without auth
    log("Testing GET /tests (no auth)")
    r = no_auth.get(f"{BASE_URL}/tests")
    if not assert_status(r, 401, "tests no auth"): return False
    log("✅ GET /tests returns 401 without auth")
    
    # POST /chat without auth
    log("Testing POST /chat (no auth)")
    r = no_auth.post(f"{BASE_URL}/chat", json={"message": "hello"})
    if not assert_status(r, 401, "chat no auth"): return False
    log("✅ POST /chat returns 401 without auth")
    
    # POST /generate-test without auth
    log("Testing POST /generate-test (no auth)")
    r = no_auth.post(f"{BASE_URL}/generate-test", json={"prompt": "test"})
    if not assert_status(r, 401, "generate-test no auth"): return False
    log("✅ POST /generate-test returns 401 without auth")
    
    log("✅✅✅ SECTION 3 PASSED")
    return True

# ============================================================================
# SECTION 4: ADMIN ADS CRUD
# ============================================================================
def test_admin_ads(session1, session2):
    test_section("4) ADMIN ADS CRUD")
    
    # Non-admin tries to access admin endpoint
    log("Testing GET /admin/ads (non-admin)")
    r = session2.get(f"{BASE_URL}/admin/ads")
    if not assert_status(r, 403, "admin/ads non-admin"): return False, None
    log("✅ Non-admin gets 403 for /admin/ads")
    
    # Admin gets ads (should be empty initially)
    log("Testing GET /admin/ads (admin)")
    r = session1.get(f"{BASE_URL}/admin/ads")
    if not assert_status(r, 200, "admin/ads admin"): return False, None
    data = r.json()
    if not assert_field(data, "ads", "admin/ads"): return False, None
    if not assert_field(data, "adsense", "admin/ads"): return False, None
    if not assert_field(data, "stats", "admin/ads"): return False, None
    log(f"✅ Admin ads list: {len(data['ads'])} ads, stats: {data['stats']}")
    
    # Create first ad
    log("Testing POST /admin/ads (create ad 1)")
    r = session1.post(f"{BASE_URL}/admin/ads", json={
        "title": "Buy Coffee",
        "image_url": "https://picsum.photos/400/200",
        "target_url": "https://example.com",
        "type": "image",
        "duration": 5
    })
    if not assert_status(r, 200, "create ad 1"): return False, None
    data = r.json()
    if not assert_field(data, "ad", "create ad 1"): return False, None
    ad1_id = data["ad"]["id"]
    log(f"✅ Ad 1 created: {ad1_id}, title={data['ad']['title']}")
    
    # Create second ad
    log("Testing POST /admin/ads (create ad 2)")
    r = session1.post(f"{BASE_URL}/admin/ads", json={
        "title": "Course Promo",
        "image_url": "https://picsum.photos/400/200",
        "target_url": "https://example.com",
        "type": "image",
        "duration": 5
    })
    if not assert_status(r, 200, "create ad 2"): return False, None
    data = r.json()
    ad2_id = data["ad"]["id"]
    log(f"✅ Ad 2 created: {ad2_id}, title={data['ad']['title']}")
    
    # Get ads again (should have 2)
    log("Testing GET /admin/ads (should have 2 ads)")
    r = session1.get(f"{BASE_URL}/admin/ads")
    if not assert_status(r, 200, "admin/ads after create"): return False, None
    data = r.json()
    if len(data["ads"]) < 2:
        log(f"❌ FAIL: Expected at least 2 ads, got {len(data['ads'])}")
        return False, None
    log(f"✅ Admin ads list now has {len(data['ads'])} ads")
    
    # Update ad (set active=false)
    log(f"Testing PUT /admin/ads/{ad1_id} (set active=false)")
    r = session1.put(f"{BASE_URL}/admin/ads/{ad1_id}", json={"active": False})
    if not assert_status(r, 200, "update ad active=false"): return False, None
    log("✅ Ad updated to active=false")
    
    # Update ad (set active=true)
    log(f"Testing PUT /admin/ads/{ad1_id} (set active=true)")
    r = session1.put(f"{BASE_URL}/admin/ads/{ad1_id}", json={"active": True})
    if not assert_status(r, 200, "update ad active=true"): return False, None
    log("✅ Ad updated to active=true")
    
    # Set adsense config
    log("Testing POST /admin/adsense")
    r = session1.post(f"{BASE_URL}/admin/adsense", json={
        "client": "ca-pub-12345",
        "slot": "1234567"
    })
    if not assert_status(r, 200, "adsense config"): return False, None
    log("✅ Adsense config saved")
    
    log("✅✅✅ SECTION 4 PASSED")
    return True, ad1_id

# ============================================================================
# SECTION 5: ADS SEEN FLOW
# ============================================================================
def test_ads_seen(session1, session2, ad_id):
    test_section("5) ADS SEEN FLOW")
    
    # Get ads/today (should return ads, needs=true)
    log("Testing GET /ads/today (user)")
    r = session2.get(f"{BASE_URL}/ads/today")
    if not assert_status(r, 200, "ads/today"): return False
    data = r.json()
    if not assert_field(data, "needs", "ads/today"): return False
    if not assert_field(data, "ads", "ads/today"): return False
    if not data["needs"]:
        log(f"❌ FAIL: Expected needs=true, got {data['needs']}")
        return False
    log(f"✅ Ads/today: needs={data['needs']}, ads count={len(data['ads'])}")
    
    if len(data["ads"]) == 0:
        log("⚠️ WARNING: No ads returned (might be no active ads)")
    else:
        # Post impression
        log("Testing POST /ads/impression")
        r = session2.post(f"{BASE_URL}/ads/impression", json={"ad_id": data["ads"][0]["id"]})
        if not assert_status(r, 200, "ads/impression"): return False
        log("✅ Impression recorded")
        
        # Post click
        log("Testing POST /ads/click")
        r = session2.post(f"{BASE_URL}/ads/click", json={"ad_id": data["ads"][0]["id"]})
        if not assert_status(r, 200, "ads/click"): return False
        log("✅ Click recorded")
    
    # Mark ads as seen
    log("Testing POST /ads/seen")
    r = session2.post(f"{BASE_URL}/ads/seen", json={})
    if not assert_status(r, 200, "ads/seen"): return False
    log("✅ Ads marked as seen")
    
    # Get ads/today again (should return needs=false)
    log("Testing GET /ads/today (after seen)")
    r = session2.get(f"{BASE_URL}/ads/today")
    if not assert_status(r, 200, "ads/today after seen"): return False
    data = r.json()
    if data["needs"]:
        log(f"❌ FAIL: Expected needs=false after seen, got {data['needs']}")
        return False
    log(f"✅ Ads/today after seen: needs={data['needs']}")
    
    # Check admin stats (impressions/clicks should be incremented)
    log("Testing GET /admin/ads (check stats)")
    r = session1.get(f"{BASE_URL}/admin/ads")
    if not assert_status(r, 200, "admin/ads stats"): return False
    data = r.json()
    log(f"✅ Admin stats: {data['stats']}")
    
    log("✅✅✅ SECTION 5 PASSED")
    return True

# ============================================================================
# SECTION 6: GENERATE + SOLVE FLOW
# ============================================================================
def test_generate_solve(session2):
    test_section("6) GENERATE + SOLVE FLOW")
    
    # Generate test
    log("Testing POST /generate-test (90s timeout)")
    r = session2.post(f"{BASE_URL}/generate-test", json={
        "prompt": "Generate 1 easy Python problem"
    }, timeout=90)
    if not assert_status(r, 200, "generate-test"): return False, None, None
    data = r.json()
    if not assert_field(data, "test", "generate-test"): return False, None, None
    test_obj = data["test"]
    if not assert_field(test_obj, "id", "test object"): return False, None, None
    if not assert_field(test_obj, "questions", "test object"): return False, None, None
    if len(test_obj["questions"]) < 1:
        log(f"❌ FAIL: Expected at least 1 question, got {len(test_obj['questions'])}")
        return False, None, None
    
    test_id = test_obj["id"]
    question = test_obj["questions"][0]
    question_id = question["id"]
    test_cases = question.get("test_cases", [])
    starter_code = question.get("starter_code", {})
    
    log(f"✅ Test generated: {test_id}, questions={len(test_obj['questions'])}, test_cases={len(test_cases)}")
    
    # Get tests list
    log("Testing GET /tests")
    r = session2.get(f"{BASE_URL}/tests")
    if not assert_status(r, 200, "tests list"): return False, None, None
    data = r.json()
    if not assert_field(data, "tests", "tests list"): return False, None, None
    found = any(t["id"] == test_id for t in data["tests"])
    if not found:
        log(f"❌ FAIL: Generated test {test_id} not in tests list")
        return False, None, None
    log(f"✅ Tests list contains generated test")
    
    # Execute code
    log("Testing POST /execute")
    r = session2.post(f"{BASE_URL}/execute", json={
        "code": "print(input())",
        "language": "python",
        "stdin": "hi"
    })
    if not assert_status(r, 200, "execute"): return False, None, None
    data = r.json()
    if not assert_field(data, "stdout", "execute"): return False, None, None
    if "hi" not in data["stdout"]:
        log(f"❌ FAIL: Expected 'hi' in stdout, got '{data['stdout']}'")
        return False, None, None
    log(f"✅ Execute: stdout='{data['stdout'].strip()}'")
    
    # Submit code
    log("Testing POST /submit (90s timeout)")
    submit_code = starter_code.get("python", "print('hello')")
    r = session2.post(f"{BASE_URL}/submit", json={
        "test_id": test_id,
        "question_id": question_id,
        "code": submit_code,
        "language": "python"
    }, timeout=90)
    if not assert_status(r, 200, "submit"): return False, None, None
    data = r.json()
    if not assert_field(data, "attempt", "submit"): return False, None, None
    attempt = data["attempt"]
    if not assert_field(attempt, "id", "attempt"): return False, None, None
    if not assert_field(attempt, "passed", "attempt"): return False, None, None
    if not assert_field(attempt, "total", "attempt"): return False, None, None
    if not assert_field(attempt, "results", "attempt"): return False, None, None
    if not assert_field(attempt, "feedback", "attempt"): return False, None, None
    log(f"✅ Submit: passed={attempt['passed']}/{attempt['total']}, feedback_len={len(attempt['feedback'])}")
    
    # Get attempts history
    log(f"Testing GET /attempts/{question_id}")
    r = session2.get(f"{BASE_URL}/attempts/{question_id}")
    if not assert_status(r, 200, "attempts history"): return False, None, None
    data = r.json()
    if not assert_field(data, "attempts", "attempts history"): return False, None, None
    if len(data["attempts"]) < 1:
        log(f"❌ FAIL: Expected at least 1 attempt, got {len(data['attempts'])}")
        return False, None, None
    log(f"✅ Attempts history: {len(data['attempts'])} attempts")
    
    # Get stats
    log("Testing GET /stats")
    r = session2.get(f"{BASE_URL}/stats")
    if not assert_status(r, 200, "stats"): return False, None, None
    data = r.json()
    if not assert_field(data, "total", "stats"): return False, None, None
    if data["total"] < 1:
        log(f"❌ FAIL: Expected total>=1, got {data['total']}")
        return False, None, None
    log(f"✅ Stats: total={data['total']}, solved={data.get('solved', 0)}, accuracy={data.get('accuracy', 0)}%")
    
    # Get hint
    log("Testing POST /hint")
    r = session2.post(f"{BASE_URL}/hint", json={
        "test_id": test_id,
        "question_id": question_id,
        "code": "",
        "language": "python"
    })
    if not assert_status(r, 200, "hint"): return False, None, None
    data = r.json()
    if not assert_field(data, "hint", "hint"): return False, None, None
    if len(data["hint"]) < 5:
        log(f"❌ FAIL: Hint too short: '{data['hint']}'")
        return False, None, None
    log(f"✅ Hint: '{data['hint'][:80]}...'")
    
    log("✅✅✅ SECTION 6 PASSED")
    return True, test_id, question_id

# ============================================================================
# SECTION 7: SHARE + LEADERBOARD
# ============================================================================
def test_share_leaderboard(test_id):
    test_section("7) SHARE + LEADERBOARD (public)")
    
    # Share (no auth)
    log(f"Testing GET /share/{test_id} (no auth)")
    r = requests.get(f"{BASE_URL}/share/{test_id}")
    if not assert_status(r, 200, "share"): return False
    data = r.json()
    if not assert_field(data, "test", "share"): return False
    test_obj = data["test"]
    if not assert_field(test_obj, "questions", "share test"): return False
    
    # Check that hidden test cases are removed
    for q in test_obj["questions"]:
        for tc in q.get("test_cases", []):
            if tc.get("hidden"):
                log(f"❌ FAIL: Hidden test case found in shared test")
                return False
    log(f"✅ Share: test returned, hidden test cases removed")
    
    # Leaderboard (no auth)
    log(f"Testing GET /leaderboard/{test_id} (no auth)")
    r = requests.get(f"{BASE_URL}/leaderboard/{test_id}")
    if not assert_status(r, 200, "leaderboard"): return False
    data = r.json()
    if not assert_field(data, "leaderboard", "leaderboard"): return False
    log(f"✅ Leaderboard: {len(data['leaderboard'])} entries")
    
    log("✅✅✅ SECTION 7 PASSED")
    return True

# ============================================================================
# SECTION 8: STREAMING CHAT
# ============================================================================
def test_streaming_chat(session2):
    test_section("8) STREAMING CHAT")
    
    log("Testing POST /chat/stream")
    r = session2.post(f"{BASE_URL}/chat/stream", json={
        "message": "explain a closure in 1 line",
        "session_id": "test-stream"
    }, stream=True, timeout=30)
    
    if not assert_status(r, 200, "chat/stream"): return False
    
    # Check content-type
    content_type = r.headers.get("content-type", "")
    if not content_type.startswith("text/plain"):
        log(f"❌ FAIL: Expected content-type text/plain, got '{content_type}'")
        return False
    log(f"✅ Content-Type: {content_type}")
    
    # Read stream
    chunks = []
    for chunk in r.iter_content(chunk_size=1024, decode_unicode=True):
        if chunk:
            chunks.append(chunk)
    
    full_text = "".join(chunks)
    
    # Check for __SID__ prefix
    if not full_text.startswith("__SID__:"):
        log(f"❌ FAIL: Stream should start with '__SID__:', got: '{full_text[:50]}'")
        return False
    
    lines = full_text.split("\n", 1)
    sid_line = lines[0]
    content = lines[1] if len(lines) > 1 else ""
    
    log(f"✅ Stream started with: {sid_line}")
    
    if len(content.strip()) < 10:
        log(f"❌ FAIL: Stream content too short: '{content}'")
        return False
    log(f"✅ Stream content: {len(content)} chars, preview: '{content[:80]}...'")
    
    # Check chat history
    log("Testing GET /chats/test-stream")
    r = session2.get(f"{BASE_URL}/chats/test-stream")
    if not assert_status(r, 200, "chats history"): return False
    data = r.json()
    if not assert_field(data, "messages", "chats history"): return False
    if len(data["messages"]) < 2:
        log(f"❌ FAIL: Expected at least 2 messages (user + assistant), got {len(data['messages'])}")
        return False
    log(f"✅ Chat history: {len(data['messages'])} messages")
    
    log("✅✅✅ SECTION 8 PASSED")
    return True

# ============================================================================
# SECTION 9: MULTI-USER ISOLATION
# ============================================================================
def test_multi_user_isolation(session1, session2, test_id):
    test_section("9) MULTI-USER ISOLATION")
    
    # Admin should NOT see user's test
    log("Testing GET /tests (admin)")
    r = session1.get(f"{BASE_URL}/tests")
    if not assert_status(r, 200, "tests admin"): return False
    data = r.json()
    admin_tests = data["tests"]
    found = any(t["id"] == test_id for t in admin_tests)
    if found:
        log(f"❌ FAIL: Admin should NOT see user's test {test_id}")
        return False
    log(f"✅ Admin tests: {len(admin_tests)} tests (does not contain user's test)")
    
    # User should see their own test
    log("Testing GET /tests (user)")
    r = session2.get(f"{BASE_URL}/tests")
    if not assert_status(r, 200, "tests user"): return False
    data = r.json()
    user_tests = data["tests"]
    found = any(t["id"] == test_id for t in user_tests)
    if not found:
        log(f"❌ FAIL: User should see their own test {test_id}")
        return False
    log(f"✅ User tests: {len(user_tests)} tests (contains their test)")
    
    log("✅✅✅ SECTION 9 PASSED")
    return True

# ============================================================================
# SECTION 10: DELETE TEST
# ============================================================================
def test_delete_test(session2, test_id):
    test_section("10) DELETE TEST")
    
    # Delete test
    log(f"Testing DELETE /tests/{test_id}")
    r = session2.delete(f"{BASE_URL}/tests/{test_id}")
    if not assert_status(r, 200, "delete test"): return False
    data = r.json()
    if not data.get("deleted"):
        log(f"❌ FAIL: Expected deleted=true, got {data}")
        return False
    log("✅ Test deleted")
    
    # Verify test is gone
    log("Testing GET /tests (after delete)")
    r = session2.get(f"{BASE_URL}/tests")
    if not assert_status(r, 200, "tests after delete"): return False
    data = r.json()
    found = any(t["id"] == test_id for t in data["tests"])
    if found:
        log(f"❌ FAIL: Deleted test {test_id} still in tests list")
        return False
    log("✅ Test no longer in tests list")
    
    log("✅✅✅ SECTION 10 PASSED")
    return True

# ============================================================================
# MAIN
# ============================================================================
def main():
    print("\n" + "="*80)
    print("AI CODING PRACTICE ARENA - PHASE 2 BACKEND TEST")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print("="*80 + "\n")
    
    try:
        # Section 1: Public endpoints
        if not test_public_endpoints():
            log("❌❌❌ SECTION 1 FAILED")
            return False
        
        # Section 2: Auth
        result = test_auth()
        if not result[0]:
            log("❌❌❌ SECTION 2 FAILED")
            return False
        session1, session2 = result[1], result[2]
        
        # Section 3: Unauthorized
        if not test_unauthorized():
            log("❌❌❌ SECTION 3 FAILED")
            return False
        
        # Section 4: Admin ads CRUD
        result = test_admin_ads(session1, session2)
        if not result[0]:
            log("❌❌❌ SECTION 4 FAILED")
            return False
        ad_id = result[1]
        
        # Section 5: Ads seen flow
        if not test_ads_seen(session1, session2, ad_id):
            log("❌❌❌ SECTION 5 FAILED")
            return False
        
        # Section 6: Generate + solve flow
        result = test_generate_solve(session2)
        if not result[0]:
            log("❌❌❌ SECTION 6 FAILED")
            return False
        test_id, question_id = result[1], result[2]
        
        # Section 7: Share + leaderboard
        if not test_share_leaderboard(test_id):
            log("❌❌❌ SECTION 7 FAILED")
            return False
        
        # Section 8: Streaming chat
        if not test_streaming_chat(session2):
            log("❌❌❌ SECTION 8 FAILED")
            return False
        
        # Section 9: Multi-user isolation
        if not test_multi_user_isolation(session1, session2, test_id):
            log("❌❌❌ SECTION 9 FAILED")
            return False
        
        # Section 10: Delete test
        if not test_delete_test(session2, test_id):
            log("❌❌❌ SECTION 10 FAILED")
            return False
        
        print("\n" + "="*80)
        print("🎉🎉🎉 ALL TESTS PASSED 🎉🎉🎉")
        print("="*80 + "\n")
        return True
        
    except Exception as e:
        log(f"❌ EXCEPTION: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)

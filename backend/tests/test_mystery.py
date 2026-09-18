"""第三方暗访接口测试：任务下发、暗访提交、问题转普通整改、统计分离。"""

from datetime import datetime, timedelta

from tests.conftest import full_items


def _create_task(client, district="测试区", **overrides):
    payload = {
        "name": f"{district}第三十周暗访",
        "district": district,
        "period": "2026-W38",
        "inspector": "公信测评机构",
        "start_date": (datetime.now() - timedelta(days=2)).isoformat(),
        "end_date": (datetime.now() + timedelta(days=4)).isoformat(),
    }
    payload.update(overrides)
    return client.post("/api/v1/mystery-tasks", json=payload)


def test_dictionaries_include_mystery(client):
    payload = client.get("/api/v1/meta/dictionaries").json()
    assert "第三方暗访" in payload["issue_source"]
    assert payload["mystery_task_status"] == ["待执行", "进行中", "已完成", "已取消"]
    assert payload["mystery_task_transitions"]["待执行"] == ["进行中", "已取消"]


def test_task_dispatch_and_period_filter(client):
    created = _create_task(client)
    assert created.status_code == 201, created.text
    task = created.json()
    assert task["code"].startswith("AF-")
    assert task["status"] == "待执行"
    assert task["period"] == "2026-W38"

    listed = client.get("/api/v1/mystery-tasks", params={"district": "测试区"}).json()
    assert listed["meta"]["total"] >= 1
    periods = client.get("/api/v1/mystery-tasks/periods").json()
    assert "2026-W38" in periods

    # 周期缺省时按开始时间所在 ISO 周自动生成
    auto = client.post(
        "/api/v1/mystery-tasks",
        json={"name": "自动周期任务", "district": "测试区", "inspector": "机构乙"},
    ).json()
    now = datetime.now()
    assert auto["period"] == f"{now.isocalendar()[0]}-W{now.isocalendar()[1]:02d}"


def test_submit_visit_scoring_and_validation(client, restroom):
    task = _create_task(client).json()

    good = client.post(
        "/api/v1/mystery-visits",
        json={
            "task_id": task["id"],
            "restroom_id": restroom["id"],
            "inspector": "暗访员甲",
            "items": full_items(9),
        },
    ).json()
    assert good["score"] == 90.0
    assert good["grade"] == "优秀"
    assert good["result"] == "正常"

    # 首次提交暗访记录后，任务自动从待执行转为进行中
    changed = client.get(f"/api/v1/mystery-tasks/{task['id']}").json()
    assert changed["status"] == "进行中"
    assert changed["visit_count"] == 1

    # 结论为发现问题时，必须填写问题说明与现场影像
    bad_items = full_items(9)
    bad_items[0]["score"] = 3
    missing = client.post(
        "/api/v1/mystery-visits",
        json={
            "task_id": task["id"],
            "restroom_id": restroom["id"],
            "inspector": "暗访员甲",
            "items": bad_items,
        },
    )
    assert missing.status_code == 400
    rejected = client.post(
        "/api/v1/mystery-visits",
        json={
            "task_id": task["id"],
            "restroom_id": restroom["id"],
            "inspector": "暗访员甲",
            "items": bad_items,
            "problem_desc": "地面污渍明显",
        },
    )
    assert rejected.status_code == 400
    assert "现场影像" in rejected.json()["detail"]

    bad = client.post(
        "/api/v1/mystery-visits",
        json={
            "task_id": task["id"],
            "restroom_id": restroom["id"],
            "inspector": "暗访员甲",
            "items": bad_items,
            "images": ["https://example.com/evidence/1.jpg"],
            "problem_desc": "地面污渍明显，通风差",
        },
    ).json()
    assert bad["result"] == "发现问题"
    assert bad["images"] == ["https://example.com/evidence/1.jpg"]

    visits = client.get(
        "/api/v1/mystery-visits", params={"result": "发现问题", "district": "测试区"}
    ).json()
    assert visits["meta"]["total"] == 1
    assert visits["items"][0]["id"] == bad["id"]


def test_visit_rejects_restroom_outside_task_district(client, restroom):
    task = _create_task(client, district="测试区").json()
    other = client.post(
        "/api/v1/restrooms",
        json={"name": "外区公厕", "district": "城南区", "address": "城南大道 9 号"},
    ).json()
    resp = client.post(
        "/api/v1/mystery-visits",
        json={
            "task_id": task["id"],
            "restroom_id": other["id"],
            "inspector": "暗访员甲",
            "items": full_items(9),
        },
    )
    assert resp.status_code == 400
    assert "不在暗访任务区域" in resp.json()["detail"]


def test_completed_task_rejects_new_visit(client, restroom):
    task = _create_task(client).json()
    client.post(
        "/api/v1/mystery-visits",
        json={
            "task_id": task["id"],
            "restroom_id": restroom["id"],
            "inspector": "暗访员甲",
            "items": full_items(9),
        },
    )
    finished = client.post(
        f"/api/v1/mystery-tasks/{task['id']}/transitions",
        json={"to_status": "已完成", "operator": "项目负责人", "remark": "材料回收"},
    )
    assert finished.status_code == 200
    again = client.post(
        "/api/v1/mystery-visits",
        json={
            "task_id": task["id"],
            "restroom_id": restroom["id"],
            "inspector": "暗访员甲",
            "items": full_items(9),
        },
    )
    assert again.status_code == 400


def test_mystery_issue_enters_normal_rectification(client, restroom):
    task = _create_task(client).json()
    bad_items = full_items(9)
    bad_items[0]["score"] = 3
    visit = client.post(
        "/api/v1/mystery-visits",
        json={
            "task_id": task["id"],
            "restroom_id": restroom["id"],
            "inspector": "暗访员甲",
            "items": bad_items,
            "images": ["https://example.com/evidence/2.jpg"],
            "problem_desc": "地面有明显污渍",
        },
    ).json()

    issue = client.post(
        "/api/v1/issues",
        json={
            "restroom_id": restroom["id"],
            "mystery_visit_id": visit["id"],
            "title": "暗访发现地面污渍未清理",
            "category": "保洁不到位",
            "severity": "严重",
            "reporter": "暗访员甲",
            "assignee": "保洁班组",
        },
    ).json()
    # 暗访问题与普通问题共用同一整改流程，来源单独标记
    assert issue["status"] == "待整改"
    assert issue["source"] == "第三方暗访"
    assert issue["mystery_visit_id"] == visit["id"]
    assert issue["inspection_id"] is None
    assert issue["records"][0]["action"] == "上报问题"
    assert "暗访" in issue["records"][0]["remark"]

    # 暗访问题按普通问题流转整改流程
    processing = client.post(
        f"/api/v1/issues/{issue['id']}/transitions",
        json={"to_status": "整改中", "operator": "保洁班组", "remark": "安排清洗"},
    ).json()
    assert processing["status"] == "整改中"

    mystery_only = client.get(
        "/api/v1/issues", params={"source": "第三方暗访", "restroom_id": restroom["id"]}
    ).json()
    assert mystery_only["meta"]["total"] == 1
    internal_only = client.get(
        "/api/v1/issues", params={"source": "内部巡查", "restroom_id": restroom["id"]}
    ).json()
    assert internal_only["meta"]["total"] == 0

    # 暗访记录可反查关联问题数量
    detail = client.get(f"/api/v1/mystery-visits/{visit['id']}").json()
    assert detail["issue_count"] == 1


def test_mystery_issue_requires_matching_restroom(client, restroom):
    task = _create_task(client).json()
    visit = client.post(
        "/api/v1/mystery-visits",
        json={
            "task_id": task["id"],
            "restroom_id": restroom["id"],
            "inspector": "暗访员甲",
            "items": full_items(9),
        },
    ).json()
    other = client.post(
        "/api/v1/restrooms",
        json={"name": "另一座公厕", "district": "测试区", "address": "测试路 8 号"},
    ).json()
    resp = client.post(
        "/api/v1/issues",
        json={
            "restroom_id": other["id"],
            "mystery_visit_id": visit["id"],
            "title": "关联错误",
        },
    )
    assert resp.status_code == 400
    assert "不一致" in resp.json()["detail"]


def test_scores_kept_separate_and_restroom_guarded(client, restroom):
    # 内部巡查全部 9 分 -> 90；暗访全部 3 分 -> 30，两套得分不能混入
    client.post(
        "/api/v1/inspections",
        json={"restroom_id": restroom["id"], "inspector": "内部巡查员", "items": full_items(9)},
    )
    task = _create_task(client).json()
    client.post(
        "/api/v1/mystery-visits",
        json={
            "task_id": task["id"],
            "restroom_id": restroom["id"],
            "inspector": "暗访员甲",
            "items": full_items(3),
            "images": ["https://example.com/evidence/3.jpg"],
            "problem_desc": "整体卫生不达标",
        },
    )

    detail = client.get(f"/api/v1/restrooms/{restroom['id']}").json()
    assert detail["inspection_count"] == 1
    assert detail["avg_score"] == 90.0
    assert detail["mystery_visit_count"] == 1
    assert detail["avg_mystery_score"] == 30.0

    overview = client.get("/api/v1/stats/overview").json()
    assert overview["inspection_total"] >= 1
    assert overview["mystery_visit_total"] >= 1
    # 两套均分字段各自独立维护
    assert 0 <= overview["avg_score_week"] <= 100
    assert 0 <= overview["avg_mystery_score_week"] <= 100

    dashboard = client.get("/api/v1/stats/dashboard", params={"trend_days": 7}).json()
    assert {item["name"] for item in dashboard["issue_by_source"]} == {
        "内部巡查",
        "第三方暗访",
        "群众反馈",
    }
    district_row = next(item for item in dashboard["districts"] if item["district"] == "测试区")
    assert district_row["mystery_visit_count"] >= 1
    assert "avg_mystery_score" in district_row
    assert dashboard["recent_mystery_visits"]
    assert sum(point["mystery_visits"] for point in dashboard["inspection_trend"]) >= 1
    assert sum(point["inspections"] for point in dashboard["inspection_trend"]) >= 1

    # 存在暗访记录时删除公厕同样受保护
    blocked = client.delete(f"/api/v1/restrooms/{restroom['id']}")
    assert blocked.status_code == 409
    assert "暗访记录" in blocked.json()["detail"]

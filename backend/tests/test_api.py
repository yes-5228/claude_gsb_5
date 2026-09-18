"""接口级测试：覆盖台账、巡查、问题整改与统计看板。"""

from datetime import datetime, timedelta

from tests.conftest import full_items


def test_health_and_dictionaries(client):
    assert client.get("/health").json()["status"] == "ok"
    payload = client.get("/api/v1/meta/dictionaries").json()
    assert "待整改" in payload["issue_status"]
    assert len(payload["inspection_check_items"]) == 8
    assert payload["issue_transitions"]["待整改"] == ["整改中", "已关闭"]


def test_restroom_crud_and_delete_guard(client, restroom):
    assert restroom["code"].startswith("WC-")

    listed = client.get("/api/v1/restrooms", params={"district": "测试区"}).json()
    assert listed["meta"]["total"] >= 1

    detail = client.get(f"/api/v1/restrooms/{restroom['id']}").json()
    assert detail["inspection_count"] == 0
    assert detail["open_issue_count"] == 0

    updated = client.patch(
        f"/api/v1/restrooms/{restroom['id']}", json={"status": "维修中", "manager": "新责任人"}
    ).json()
    assert updated["status"] == "维修中"
    assert updated["manager"] == "新责任人"

    # 存在关联数据时不允许直接删除
    client.post(
        "/api/v1/inspections",
        json={
            "restroom_id": restroom["id"],
            "inspector": "测试巡查员",
            "shift": "早班",
            "items": full_items(9),
        },
    )
    blocked = client.delete(f"/api/v1/restrooms/{restroom['id']}")
    assert blocked.status_code == 409

    ok = client.delete(f"/api/v1/restrooms/{restroom['id']}", params={"force": "true"})
    assert ok.status_code == 200
    assert client.get(f"/api/v1/restrooms/{restroom['id']}").status_code == 404


def test_inspection_scoring_and_filter(client, restroom):
    good = client.post(
        "/api/v1/inspections",
        json={
            "restroom_id": restroom["id"],
            "inspector": "李巡查",
            "shift": "中班",
            "items": full_items(9),
            "remark": "整体良好",
        },
    ).json()
    assert good["score"] == 90.0
    assert good["grade"] == "优秀"
    assert good["result"] == "正常"

    bad_items = full_items(9)
    bad_items[0]["score"] = 3
    bad_items[0]["remark"] = "地面污渍"
    bad = client.post(
        "/api/v1/inspections",
        json={
            "restroom_id": restroom["id"],
            "inspector": "李巡查",
            "shift": "晚班",
            "items": bad_items,
        },
    ).json()
    assert bad["result"] == "发现问题"
    assert bad["score"] < 90

    filtered = client.get(
        "/api/v1/inspections", params={"result": "发现问题", "restroom_id": restroom["id"]}
    ).json()
    assert filtered["meta"]["total"] == 1
    assert filtered["items"][0]["id"] == bad["id"]
    assert filtered["items"][0]["restroom"]["name"] == restroom["name"]

    today = datetime.now().date().isoformat()
    ranged = client.get(
        "/api/v1/inspections", params={"date_from": today, "date_to": today}
    ).json()
    assert ranged["meta"]["total"] == 2

    duplicate = full_items(5) + [{"name": "地面与台阶清洁", "score": 4}]
    rejected = client.post(
        "/api/v1/inspections",
        json={"restroom_id": restroom["id"], "inspector": "李巡查", "items": duplicate},
    )
    assert rejected.status_code == 400

    empty = client.post(
        "/api/v1/inspections",
        json={"restroom_id": restroom["id"], "inspector": "李巡查", "items": []},
    )
    assert empty.status_code == 422


def test_issue_lifecycle(client, restroom):
    inspection = client.post(
        "/api/v1/inspections",
        json={
            "restroom_id": restroom["id"],
            "inspector": "王巡查",
            "items": full_items(4),
        },
    ).json()

    issue = client.post(
        "/api/v1/issues",
        json={
            "restroom_id": restroom["id"],
            "inspection_id": inspection["id"],
            "title": "地面污渍未清理",
            "description": "巡查发现地面有明显污渍",
            "category": "保洁不到位",
            "severity": "严重",
            "reporter": "王巡查",
            "assignee": "保洁班组",
            "deadline": (datetime.now() - timedelta(days=1)).isoformat(),
        },
    ).json()
    assert issue["status"] == "待整改"
    assert len(issue["records"]) == 1
    assert issue["records"][0]["action"] == "上报问题"

    # 越级流转被拒绝：待整改 -> 已完成
    invalid = client.post(
        f"/api/v1/issues/{issue['id']}/transitions",
        json={"to_status": "已完成", "operator": "值班长"},
    )
    assert invalid.status_code == 400
    assert "不允许流转" in invalid.json()["detail"]

    options = client.get(f"/api/v1/issues/{issue['id']}/transitions").json()
    assert {option["status"] for option in options} == {"整改中", "已关闭"}

    processing = client.post(
        f"/api/v1/issues/{issue['id']}/transitions",
        json={"to_status": "整改中", "operator": "保洁班组张伟", "remark": "已安排清洗"},
    ).json()
    assert processing["status"] == "整改中"
    assert processing["assignee"] == "保洁班组"

    reviewing = client.post(
        f"/api/v1/issues/{issue['id']}/transitions",
        json={"to_status": "待验收", "operator": "保洁班组张伟", "remark": "整改完成待验收"},
    ).json()
    assert reviewing["status"] == "待验收"

    # 验收驳回回到整改中
    rejected = client.post(
        f"/api/v1/issues/{issue['id']}/transitions",
        json={"to_status": "整改中", "operator": "王巡查", "remark": "角落仍有残留"},
    ).json()
    assert rejected["status"] == "整改中"
    assert rejected["records"][-1]["action"] == "验收驳回"

    for target in ("待验收", "已完成", "已关闭"):
        payload = {"to_status": target, "operator": "值班长", "remark": f"流转到{target}"}
        response = client.post(f"/api/v1/issues/{issue['id']}/transitions", json=payload)
        assert response.status_code == 200, response.text
    final = response.json()
    assert final["status"] == "已关闭"
    assert final["closed_at"] is not None
    assert [record["to_status"] for record in final["records"]][-1] == "已关闭"

    closed_record = client.post(
        f"/api/v1/issues/{issue['id']}/records",
        json={"action": "整改进度", "operator": "值班长", "remark": "补充说明"},
    )
    assert closed_record.status_code == 400

    overdue = client.get("/api/v1/issues", params={"overdue": "true"}).json()
    assert overdue["meta"]["total"] == 0

    # 巡查记录可反查关联问题数量
    detail = client.get(f"/api/v1/inspections/{inspection['id']}").json()
    assert detail["issue_count"] == 1


def test_issue_requires_matching_restroom(client, restroom):
    other = client.post(
        "/api/v1/restrooms",
        json={"name": "另一座公厕", "district": "测试区", "address": "测试路 2 号"},
    ).json()
    inspection = client.post(
        "/api/v1/inspections",
        json={"restroom_id": other["id"], "inspector": "周巡查", "items": full_items(9)},
    ).json()
    mismatch = client.post(
        "/api/v1/issues",
        json={
            "restroom_id": restroom["id"],
            "inspection_id": inspection["id"],
            "title": "关联错误",
        },
    )
    assert mismatch.status_code == 400
    assert "不一致" in mismatch.json()["detail"]


def test_dashboard_stats(client, restroom):
    payload = client.get("/api/v1/stats/dashboard", params={"trend_days": 7}).json()
    overview = payload["overview"]
    assert overview["restroom_total"] >= 1
    assert overview["inspection_total"] >= 1
    assert len(payload["inspection_trend"]) == 7
    assert {item["name"] for item in payload["issue_by_status"]} == {
        "待整改",
        "整改中",
        "待验收",
        "已完成",
        "已关闭",
    }
    assert payload["top_restrooms"]
    assert "rectification_rate" in overview
    assert "mystery" in payload


def test_mystery_task_and_visit_flow(client, restroom):
    other = client.post(
        "/api/v1/restrooms",
        json={"name": "外区公厕", "district": "外区", "address": "外区路 1 号"},
    ).json()

    # 下发任务：按区域与周期
    task = client.post(
        "/api/v1/mystery/tasks",
        json={
            "title": "2026-09 测试区第三方暗访",
            "district": "测试区",
            "period": "2026-09",
            "inspector": "林暗访",
            "agency": "第三方测评中心",
        },
    )
    assert task.status_code == 201, task.text
    task = task.json()
    assert task["code"].startswith("AF-")
    assert task["status"] == "待执行"

    # 越级流转被拒绝：待执行 -> 已完成
    invalid = client.patch(f"/api/v1/mystery/tasks/{task['id']}", json={"status": "已完成"})
    assert invalid.status_code == 400

    # 跨区域提交暗访记录被拒绝
    mismatch = client.post(
        "/api/v1/mystery/visits",
        json={"task_id": task["id"], "restroom_id": other["id"], "items": full_items(9)},
    )
    assert mismatch.status_code == 400
    assert "不在任务区域" in mismatch.json()["detail"]

    # 暗访结论与内部巡查分开统计：提交暗访记录前后，内部巡查统计不变
    overview_before = client.get("/api/v1/stats/overview").json()

    # 提交暗访记录：统一评分表 + 现场影像 + 问题说明
    bad_items = full_items(9)
    bad_items[0]["score"] = 3
    visit = client.post(
        "/api/v1/mystery/visits",
        json={
            "task_id": task["id"],
            "restroom_id": restroom["id"],
            "items": bad_items,
            "images": ["https://example.com/a.jpg", "https://example.com/b.jpg"],
            "problem_note": "地面污渍明显，已拍照取证",
        },
    )
    assert visit.status_code == 201, visit.text
    visit = visit.json()
    assert visit["result"] == "发现问题"
    assert visit["score"] < 90
    assert visit["images"] == ["https://example.com/a.jpg", "https://example.com/b.jpg"]
    assert visit["task"]["district"] == "测试区"

    # 首条记录提交后任务自动进入「进行中」
    assert client.get(f"/api/v1/mystery/tasks/{task['id']}").json()["status"] == "进行中"

    # 暗访发现的问题按普通问题进入整改流程
    issue = client.post(
        "/api/v1/issues",
        json={
            "restroom_id": restroom["id"],
            "mystery_visit_id": visit["id"],
            "title": "暗访发现地面污渍",
            "category": "保洁不到位",
            "reporter": "林暗访",
        },
    )
    assert issue.status_code == 201, issue.text
    issue = issue.json()
    assert issue["mystery_visit_id"] == visit["id"]
    assert issue["status"] == "待整改"
    moved = client.post(
        f"/api/v1/issues/{issue['id']}/transitions",
        json={"to_status": "整改中", "operator": "保洁班组"},
    )
    assert moved.status_code == 200

    # 问题可暗访记录反查；暗访记录可见关联问题数
    by_visit = client.get("/api/v1/issues", params={"mystery_visit_id": visit["id"]}).json()
    assert by_visit["meta"]["total"] == 1
    visit_detail = client.get(f"/api/v1/mystery/visits/{visit['id']}").json()
    assert visit_detail["issue_count"] == 1

    # 暗访结论与内部巡查分开统计
    overview_after = client.get("/api/v1/stats/overview").json()
    assert overview_after["inspection_total"] == overview_before["inspection_total"]
    mystery = client.get("/api/v1/mystery/stats").json()
    assert mystery["task_total"] == 1
    assert mystery["visit_total"] == 1
    assert mystery["problem_visit_total"] == 1
    assert mystery["issue_total"] == 1
    assert mystery["issue_open"] == 1
    assert mystery["by_district"][0]["district"] == "测试区"
    dashboard = client.get("/api/v1/stats/dashboard").json()
    assert dashboard["mystery"]["visit_total"] == 1

    # 任务删除保护：存在暗访记录时需 force
    blocked = client.delete(f"/api/v1/mystery/tasks/{task['id']}")
    assert blocked.status_code == 409
    ok = client.delete(f"/api/v1/mystery/tasks/{task['id']}", params={"force": "true"})
    assert ok.status_code == 200
    assert client.get(f"/api/v1/mystery/tasks/{task['id']}").status_code == 404
    # 任务级联删除后，关联问题的 mystery_visit_id 被置空而非删除问题
    survived = client.get(f"/api/v1/issues/{issue['id']}").json()
    assert survived["mystery_visit_id"] is None


def test_mystery_visit_rejected_when_task_closed(client, restroom):
    task = client.post(
        "/api/v1/mystery/tasks",
        json={
            "title": "2026-08 测试区暗访",
            "district": "测试区",
            "period": "2026-08",
            "inspector": "赵暗访",
        },
    ).json()
    client.post(
        "/api/v1/mystery/visits",
        json={"task_id": task["id"], "restroom_id": restroom["id"], "items": full_items(9)},
    )
    finished = client.patch(f"/api/v1/mystery/tasks/{task['id']}", json={"status": "已完成"})
    assert finished.status_code == 200
    rejected = client.post(
        "/api/v1/mystery/visits",
        json={"task_id": task["id"], "restroom_id": restroom["id"], "items": full_items(9)},
    )
    assert rejected.status_code == 400
    assert "已完成" in rejected.json()["detail"]

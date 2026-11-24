import httpx

from app.config import Settings
from app.services.ai import IntelligenceService
from app.services.ai.base import RequirementInput, TestContext
from app.services.ai.demo import DemoProvider, make_title
from app.services.ai.openai_compat import OpenAICompatibleProvider, parse_json_payload

demo = DemoProvider()


def test_demo_analysis_is_deterministic_and_classifies():
    text = "The system shall lock a customer account after 5 consecutive failed login attempts within 15 minutes."
    a1 = demo.analyze_one(RequirementInput(text=text))
    a2 = demo.analyze_one(RequirementInput(text=text))
    assert a1 == a2
    assert a1.category == "Security"
    assert a1.priority == "High"
    assert a1.testable and a1.ambiguity_score == 0
    assert any("5 attempts" in c for c in a1.acceptance_criteria)


def test_demo_flags_ambiguity_with_clarification():
    a = demo.analyze_one(RequirementInput(text="Customers should be able to reset their password using a fast and user-friendly flow."))
    assert a.ambiguity_score >= 0.6
    assert not a.testable
    assert "fast" in a.ambiguity_notes and "measurable" in a.clarification


def test_priority_hint_wins():
    a = demo.analyze_one(RequirementInput(text="Customers could save payments as templates.", priority_hint="Critical"))
    assert a.priority == "Critical"


def test_title_generation():
    assert make_title("The system shall lock a customer account after 5 failed attempts.") == "Lock customer account"
    assert make_title("User sessions shall expire after 10 minutes of inactivity.").startswith("User sessions expire")


def test_demo_test_generation_types_and_links():
    text = "Passwords must contain at least 10 characters including one digit."
    a = demo.analyze_one(RequirementInput(text=text))
    ctx = TestContext(code="REQ-003", title=a.title, text=text, category=a.category, priority=a.priority,
                      acceptance_criteria=a.acceptance_criteria)
    tests = demo.generate_tests(ctx, ["positive", "negative", "edge_case", "regression", "functional"], 1)
    assert [t.test_type for t in tests] == ["positive", "negative", "edge_case", "regression", "functional"]
    for t in tests:
        assert t.steps and t.expected_result and t.test_data
        assert t.criterion_index is None or 0 <= t.criterion_index < len(a.acceptance_criteria)
    edge = tests[2]
    assert "9, 10, 11" in edge.test_data


def test_parse_json_payload_tolerates_fences():
    assert parse_json_payload('```json\n{"results": [1]}\n```') == {"results": [1]}
    assert parse_json_payload('Sure! {"a": 1} hope that helps') == {"a": 1}


def _provider(handler) -> OpenAICompatibleProvider:
    settings = Settings(ai_api_key="test-key", ai_base_url="https://llm.example/v1", ai_model="m")
    return OpenAICompatibleProvider(settings, client=httpx.Client(transport=httpx.MockTransport(handler)))


def test_openai_provider_parses_and_coerces():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["authorization"] == "Bearer test-key"
        content = ('{"results": [{"index": 0, "title": "Lock account", "category": "security", "priority": "high",'
                   ' "risk": "critical", "complexity": "low", "testable": true, "ambiguity_score": 20,'
                   ' "acceptance_criteria": "Given A\\nGiven B"}]}')
        return httpx.Response(200, json={"choices": [{"message": {"content": content}}]})

    [a] = _provider(handler).analyze([RequirementInput(text="The system shall lock accounts.")])
    assert (a.category, a.priority, a.risk, a.ambiguity_score) == ("Security", "High", "Critical", 0.2)
    assert a.acceptance_criteria == ["Given A", "Given B"]


def test_service_falls_back_to_demo_on_ai_failure():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="boom")

    service = IntelligenceService(settings=Settings(ai_api_key="k"), provider=_provider(handler))
    results, source = service.analyze([RequirementInput(text="The system shall export reports to CSV.")])
    assert source == "demo" and len(results) == 1
    assert service.last_error

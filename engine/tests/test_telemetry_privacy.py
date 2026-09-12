from app.sentry import scrub_telemetry


def test_credentials_and_financial_payloads_do_not_leave_in_telemetry():
    secret = "synthetic-private-evidence"
    event = {
        "event_id": "known-event",
        "level": "error",
        "message": secret,
        "request": {"headers": {"Authorization": secret}},
        "extra": {"body": secret},
        "contexts": {"provider": secret},
        "breadcrumbs": [{"message": secret}],
        "transaction": secret,
        "exception": {
            "values": [
                {
                    "type": "RuntimeError",
                    "value": secret,
                    "stacktrace": {
                        "frames": [
                            {
                                "filename": "monthly/router.py",
                                "function": "advance",
                                "lineno": 1,
                                "vars": {"credential": secret},
                                "pre_context": [secret],
                            }
                        ]
                    },
                }
            ]
        },
    }
    result = scrub_telemetry(event)
    assert secret not in str(result)
    assert result["event_id"] == "known-event"
    assert (
        result["exception"]["values"][0]["stacktrace"]["frames"][0]["function"]
        == "advance"
    )

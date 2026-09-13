from app.sentry import scrub_telemetry


def test_diagnostics_without_frames_keep_a_valid_sentry_event_shape():
    for stacktrace in ({}, {"frames": []}):
        result = scrub_telemetry(
            {
                "exception": {
                    "values": [
                        {
                            "type": "InfFynOperationalCheck",
                            "stacktrace": stacktrace,
                            "value": "synthetic-private-evidence",
                        }
                    ]
                }
            }
        )
        assert result["exception"]["values"][0]["type"] == "InfFynOperationalCheck"
        assert "stacktrace" not in result["exception"]["values"][0]
        assert "synthetic-private-evidence" not in str(result)
    assert "exception" not in scrub_telemetry({"message": "private log"})


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

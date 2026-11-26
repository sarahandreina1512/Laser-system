from datetime import date, datetime, time
from app.services.availability import (Booked, Cubicle, Worker,
                                       client_has_conflict, compute_availability)

D = date(2026, 10, 5)  # lunes
HOURS = (time(9), time(13))
NOW = datetime(2026, 10, 1, 8)
SCH = {0: (time(9), time(13))}
W = [Worker(1, SCH), Worker(2, SCH)]
C2 = [Cubicle(1), Cubicle(2)]


def at(h, m=0):
    return datetime(2026, 10, 5, h, m)


def run(booked, cubs=C2, workers=W, **kw):
    return compute_availability(D, 60, HOURS, cubs, workers, booked, NOW, **kw)


def test_two_resources_allow_two_simultaneous_never_three():
    b = [Booked(at(9), at(10), 1, 1), Booked(at(9), at(10), 2, 2)]
    assert at(9) not in [s.start_at for s in run(b)]
    assert at(10) in [s.start_at for s in run(b)]


def test_cubicle_change_3_to_4_updates_availability():
    b = [Booked(at(9), at(10), i, i) for i in (1, 2, 3)]
    ws = [Worker(i, SCH) for i in range(1, 5)]
    assert at(9) not in [s.start_at for s in run(b, [Cubicle(i) for i in (1, 2, 3)], ws)]
    assert at(9) in [s.start_at for s in run(b, [Cubicle(i) for i in (1, 2, 3, 4)], ws)]


def test_inactive_cubicle_not_assignable():
    s = run([], [Cubicle(1, active=False), Cubicle(2)])
    assert {x.cubicle_id for x in s} == {2}


def test_past_and_after_closing_excluded():
    s = compute_availability(D, 60, HOURS, C2, W, [], at(10, 30))
    assert min(x.start_at for x in s) == at(10, 30)
    assert max(x.end_at for x in s) <= at(13)


def test_cancelled_frees_resources():
    b = [Booked(at(9), at(10), 1, 1, status="Cancelada")]
    assert at(9) in [s.start_at for s in run(b, [Cubicle(1)], [Worker(1, SCH)])]


def test_worker_schedule_respected():
    w = [Worker(1, {0: (time(11), time(13))})]
    assert [s.start_at for s in run([], workers=w)][0] == at(11)


def test_client_conflict():
    b = [Booked(at(9), at(10), 1, 1, client_id=7)]
    assert client_has_conflict(b, 7, at(9, 30), at(10, 30))
    assert not client_has_conflict(b, 7, at(10), at(11))

import 'package:clicks_admin/core/helper/dashboard_summary.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('parses nested web dashboard summary', () {
    final snap = DashboardSnapshot({
      'jobs': {
        'total': 10,
        'completed': 4,
        'ongoing': 2,
        'onHold': 1,
        'pending': 2,
        'cancelled': 1,
        'enRoute': 1,
        'pendingList': [
          {'_id': 'j1', 'clientName': 'Ada'},
        ],
      },
      'technicians': {'active': 8, 'online': 3, 'onJob': 2},
      'sos': {
        'open': 2,
        'waitingList': [
          {'_id': 's1', 'customerName': 'Bob'},
        ],
      },
      'earnings': {'totalAllTime': 1500, 'today': 80},
      'fleet': {'vehicles': 12, 'clients': 40, 'insuredVehicles': 5},
      'trends': {'completedJobsPct': 10, 'earningsPct': -5},
      'sources': {
        'top': [
          {'name': 'Google', 'count': 4, 'percentage': 40},
          {'name': 'Historical Import', 'count': 9, 'percentage': 90},
        ],
        'subSources': [
          {'name': 'Search', 'sourceName': 'Google', 'count': 3, 'percentage': 30},
        ],
      },
    });

    expect(snap.submittedJobs, 10);
    expect(snap.completedJobs, 4);
    expect(snap.sosOpen, 2);
    expect(snap.totalEarnings, 1500);
    expect(snap.pendingList, hasLength(1));
    expect(snap.sosWaitingList, hasLength(1));
    expect(snap.topSources.map((e) => e.name), ['Google']);
    expect(snap.subSources.single.parent, 'Google');
    expect(snap.completedTrend, 10);
    expect(snap.earningsTrend, -5);
  });

  test('parses chart series and technician performance', () {
    final points = parseChartSeries({
      'data': [
        {'date': '2026-10-01', 'earnings': 100},
        {'date': '2026-10-02', 'earnings': 40},
      ],
    }, valueKey: 'earnings');
    expect(points, hasLength(2));
    expect(points.first.value, 100);

    final techs = parseTechnicianPerformance({
      'data': [
        {
          'technicianId': 't1',
          'name': 'Sam Tech',
          'completed': 8,
          'inProgress': 2,
          'cancelled': 0,
        },
      ],
    });
    expect(techs.single.acceptanceRate, 100);
    expect(techs.single.total, 10);
  });
}

import 'dart:async';

import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../core/api/dio_helper.dart';
import '../../core/api/end_points.dart';

part 'home_state.dart';

enum JobBucket { all, open, inProgress, completed }

class HomeCubit extends Cubit<HomeState> {
  HomeCubit() : super(HomeInitial());

  int open = 0;
  int inProgress = 0;
  int completed = 0;
  int submitted = 0;
  int pending = 0;
  int ongoing = 0;
  int cancelled = 0;
  double totalEarnings = 0;
  double? completedTrendPct;
  double? earningsTrendPct;
  List<Map<String, dynamic>> pendingList = [];
  List<Map<String, dynamic>> jobs = [];
  JobBucket bucket = JobBucket.all;

  String analyticsPeriod = 'month';
  int jobsCreated = 0;
  int jobsCompletedPeriod = 0;
  int jobsCancelled = 0;
  double estimatedEarnings = 0;
  Map<String, Map<String, dynamic>> byJobType = {};
  String? analyticsError;

  Timer? _poll;
  int _rev = 0;

  void startPolling() {
    _poll?.cancel();
    _poll = Timer.periodic(const Duration(seconds: 25), (_) {
      load(silent: true);
    });
  }

  void stopPolling() {
    _poll?.cancel();
    _poll = null;
  }

  @override
  Future<void> close() {
    stopPolling();
    return super.close();
  }

  Future<void> setBucket(JobBucket next) async {
    if (bucket == next) return;
    bucket = next;
    await loadJobs();
  }

  Future<void> setAnalyticsPeriod(String period) async {
    if (analyticsPeriod == period) return;
    analyticsPeriod = period;
    await loadAnalytics();
  }

  Future<void> load({bool silent = false}) async {
    if (!silent) emit(HomeLoading());
    try {
      await loadSummary();
      await loadJobs();
      emit(HomeLoaded(++_rev));
    } catch (_) {
      if (!silent || jobs.isEmpty) {
        emit(const HomeError('Failed to load dashboard'));
      }
    }
  }

  Future<void> loadSummary() async {
    final dash = await DioHelper.getData(url: EndPoints.dashboardSummary);
    if (dash.statusCode == 200 && dash.data is Map) {
      final data = dash.data as Map;
      final jobsMap = data['jobs'];
      if (jobsMap is Map) {
        submitted = (jobsMap['total'] as num?)?.toInt() ?? 0;
        completed = (jobsMap['completed'] as num?)?.toInt() ?? 0;
        ongoing = (jobsMap['ongoing'] as num?)?.toInt() ?? 0;
        pending = (jobsMap['pending'] as num?)?.toInt() ?? 0;
        cancelled = (jobsMap['cancelled'] as num?)?.toInt() ?? 0;
        open = pending + ongoing;
        inProgress = ongoing;
        final rawPending = jobsMap['pendingList'];
        if (rawPending is List) {
          pendingList = rawPending
              .whereType<Map>()
              .map((e) => Map<String, dynamic>.from(e))
              .toList();
        }
      }
      final earnings = data['earnings'];
      if (earnings is Map) {
        totalEarnings = (earnings['totalAllTime'] as num?)?.toDouble() ?? 0;
      }
      final trends = data['trends'];
      if (trends is Map) {
        completedTrendPct = (trends['completedJobsPct'] as num?)?.toDouble();
        earningsTrendPct = (trends['earningsPct'] as num?)?.toDouble();
      }
      return;
    }

    // Fallback to legacy counts endpoint
    final legacy = await DioHelper.getData(url: EndPoints.dashboard);
    if (legacy.statusCode == 200 && legacy.data is Map) {
      final counts = legacy.data['counts'];
      if (counts is Map) {
        open = (counts['open'] as num?)?.toInt() ?? 0;
        inProgress = (counts['inProgress'] as num?)?.toInt() ?? 0;
        completed = (counts['completed'] as num?)?.toInt() ?? 0;
        submitted = open + inProgress + completed;
      }
    }
  }

  Future<void> loadAnalytics() async {
    try {
      final res = await DioHelper.getData(
        url: EndPoints.analytics,
        query: {'period': analyticsPeriod},
      );
      if (res.statusCode == 200 && res.data is Map) {
        final data = res.data as Map;
        jobsCreated = (data['jobsCreated'] as num?)?.toInt() ?? 0;
        jobsCompletedPeriod = (data['jobsCompleted'] as num?)?.toInt() ?? 0;
        jobsCancelled = (data['jobsCancelled'] as num?)?.toInt() ?? 0;
        estimatedEarnings =
            (data['estimatedEarnings'] as num?)?.toDouble() ?? 0;
        byJobType = {};
        final raw = data['byJobType'];
        if (raw is Map) {
          raw.forEach((k, v) {
            if (v is Map) {
              byJobType[k.toString()] = Map<String, dynamic>.from(v);
            }
          });
        }
        analyticsError = null;
      } else {
        analyticsError =
            DioHelper.errorMessage(res) ?? 'Failed to load analytics';
      }
    } catch (_) {
      analyticsError = 'Failed to load analytics';
    }
    emit(HomeLoaded(++_rev));
  }

  Future<void> loadJobs() async {
    final list = await DioHelper.getData(
      url: EndPoints.jobs,
      query: {'limit': 50},
    );
    if (list.statusCode == 200 && list.data is Map) {
      final raw = list.data['jobs'];
      if (raw is List) {
        jobs = raw
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList();
      } else {
        jobs = [];
      }
    }
    emit(HomeLoaded(++_rev));
  }
}

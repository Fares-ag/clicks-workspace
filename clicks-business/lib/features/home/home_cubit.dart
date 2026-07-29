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
  List<Map<String, dynamic>> jobs = [];
  JobBucket bucket = JobBucket.all;

  String analyticsPeriod = 'month';
  int jobsCreated = 0;
  int jobsCompletedPeriod = 0;
  int jobsCancelled = 0;
  double estimatedEarnings = 0;
  double cutPercent = 0;
  String cutType = 'revenue';
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
      await loadCounts();
      await loadJobs();
      await loadAnalytics(); // soft-fails if API not redeployed yet
      emit(HomeLoaded(++_rev));
    } catch (_) {
      if (!silent || jobs.isEmpty) {
        emit(const HomeError('Failed to load dashboard'));
      }
    }
  }

  Future<void> loadCounts() async {
    final dash = await DioHelper.getData(url: EndPoints.dashboard);
    if (dash.statusCode == 200 && dash.data is Map) {
      final counts = dash.data['counts'];
      if (counts is Map) {
        open = (counts['open'] as num?)?.toInt() ?? 0;
        inProgress = (counts['inProgress'] as num?)?.toInt() ?? 0;
        completed = (counts['completed'] as num?)?.toInt() ?? 0;
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
        cutPercent = (data['cutPercent'] as num?)?.toDouble() ?? 0;
        cutType = data['cutType']?.toString() ?? 'revenue';
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
    final query = <String, dynamic>{'limit': 50};
    if (bucket == JobBucket.open) query['bucket'] = 'open';
    if (bucket == JobBucket.inProgress) query['bucket'] = 'inProgress';
    if (bucket == JobBucket.completed) query['bucket'] = 'completed';

    final list = await DioHelper.getData(url: EndPoints.jobs, query: query);
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

import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';

import '../models/activity_repos.dart';
import '../models/job_history_response.dart';

part 'activity_state.dart';

class ActivityCubit extends Cubit<ActivityState> {
  final ActivityRepository repo;
  ActivityCubit(this.repo) : super(ActivityInitial());

  int _page = 1;
  bool _hasMore = true;
  bool _loadingMore = false;
  List<JobDto> _jobs = [];

  Future<void> loadHistory() async {
    if (isClosed) return;
    _page = 1;
    _hasMore = true;
    _loadingMore = false;
    _jobs = [];
    emit(ActivityLoading());
    try {
      final res = await repo.getJobsHistory(page: 1);
      _jobs = res.jobs;
      _hasMore = res.hasMore;
      if (!isClosed) emit(ActivitySuccess(_jobs, hasMore: _hasMore));
    } catch (e) {
      if (!isClosed) emit(ActivityFailure(e.toString()));
    }
  }

  Future<void> loadMore() async {
    // Scroll notifications fire in bursts; without this guard one flick starts
    // several overlapping page requests that append out of order.
    if (isClosed || !_hasMore || _loadingMore) return;
    _loadingMore = true;
    final current = state;
    if (current is ActivitySuccess) {
      emit(ActivitySuccess(current.jobs, hasMore: _hasMore, loadingMore: true));
    }
    try {
      _page += 1;
      final res = await repo.getJobsHistory(page: _page);
      _jobs = [..._jobs, ...res.jobs];
      _hasMore = res.hasMore;
      if (!isClosed) emit(ActivitySuccess(_jobs, hasMore: _hasMore));
    } catch (e) {
      _page -= 1;
      if (!isClosed && current is ActivitySuccess) {
        emit(ActivitySuccess(current.jobs, hasMore: _hasMore));
      }
    } finally {
      _loadingMore = false;
    }
  }
}

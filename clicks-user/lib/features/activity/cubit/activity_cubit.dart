import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';

import '../models/activity_repos.dart';
import '../models/job_history_response.dart';

part 'activity_state.dart';

class ActivityCubit extends Cubit<ActivityState> {
  final ActivityRepository repo;
  ActivityCubit(this.repo) : super(ActivityInitial());

  Future<void> loadHistory() async {
    if (isClosed) return;
    emit(ActivityLoading());
    try {
      final jobs = await repo.getJobsHistory();
      if (!isClosed) emit(ActivitySuccess(jobs));
    } catch (e) {
      if (!isClosed) emit(ActivityFailure(e.toString()));
    }
  }
}

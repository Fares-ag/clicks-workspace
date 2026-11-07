import 'package:clicks_user/core/helper/cache_helper.dart';
import 'package:flutter/foundation.dart' show kDebugMode;
import 'package:flutter_bloc/flutter_bloc.dart';

import 'membership_api.dart';
import 'membership_models.dart';

class MembershipState {
  final bool loading;
  final bool enabled;
  final String interval;
  final List<MembershipPlan> plans;
  final List<CustomerMembership> mine;
  final String? error;
  /// True when showing local catalog because API returned no plans.
  final bool previewCatalog;
  final bool skipcashEnabled;

  const MembershipState({
    this.loading = false,
    this.enabled = false,
    this.interval = 'month',
    this.plans = const [],
    this.mine = const [],
    this.error,
    this.previewCatalog = false,
    this.skipcashEnabled = false,
  });

  CustomerMembership? get active {
    for (final sub in mine) {
      if (sub.isActive) return sub;
    }
    return null;
  }

  MembershipCover coverFor(String serviceType) =>
      coverForService(serviceType: serviceType, subscriptions: mine);

  MembershipState copyWith({
    bool? loading,
    bool? enabled,
    String? interval,
    List<MembershipPlan>? plans,
    List<CustomerMembership>? mine,
    String? error,
    bool? previewCatalog,
    bool? skipcashEnabled,
  }) {
    return MembershipState(
      loading: loading ?? this.loading,
      enabled: enabled ?? this.enabled,
      interval: interval ?? this.interval,
      plans: plans ?? this.plans,
      mine: mine ?? this.mine,
      error: error,
      previewCatalog: previewCatalog ?? this.previewCatalog,
      skipcashEnabled: skipcashEnabled ?? this.skipcashEnabled,
    );
  }
}

class MembershipCubit extends Cubit<MembershipState> {
  MembershipCubit() : super(const MembershipState());

  Future<void> load() async {
    emit(state.copyWith(loading: true, error: null));
    try {
      final flags = await MembershipApi.launchFlags();
      final enabled = flags.customerMembership || kDebugMode;
      if (!enabled) {
        emit(const MembershipState(enabled: false));
        return;
      }
      final token = CacheHelper.getAuthToken();
      var plans = <MembershipPlan>[];
      var mine = <CustomerMembership>[];
      if (token != null && token.isNotEmpty) {
        try {
          plans = await MembershipApi.plans();
        } catch (_) {}
        try {
          mine = await MembershipApi.mine();
        } catch (_) {}
      }
      final preview = plans.isEmpty;
      if (preview) {
        plans = defaultMembershipPlans;
      }
      emit(MembershipState(
        enabled: true,
        interval: state.interval,
        plans: plans,
        mine: mine,
        previewCatalog: preview,
        skipcashEnabled: flags.skipcash,
      ));
    } catch (err) {
      emit(MembershipState(
        enabled: true,
        interval: state.interval,
        plans: defaultMembershipPlans,
        previewCatalog: true,
        error: err.toString(),
      ));
    }
  }

  void setInterval(String interval) {
    if (interval != 'month' && interval != 'year') return;
    emit(state.copyWith(interval: interval));
  }
}

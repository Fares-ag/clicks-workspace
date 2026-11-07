import 'package:flutter/foundation.dart' show kDebugMode;

import '../../core/api/dio_helper.dart';
import '../../core/api/end_points.dart';
import '../../features/home/skipcash_api.dart';
import 'membership_models.dart';

class LaunchFlags {
  const LaunchFlags({
    required this.customerMembership,
    required this.skipcash,
  });

  final bool customerMembership;
  final bool skipcash;

  static const LaunchFlags off =
      LaunchFlags(customerMembership: false, skipcash: false);
}

/// What the server says about one subscription. `subscriptionStatus` is the
/// field to trust: "active" means covered; "paid_duplicate" means the money
/// arrived but the vehicle already had a plan, so it is being refunded.
class MembershipStatusResult {
  const MembershipStatusResult({
    required this.subscriptionStatus,
    required this.paymentStatus,
    this.message,
  });

  final String subscriptionStatus;
  final String paymentStatus;
  final String? message;

  bool get isActive => subscriptionStatus == 'active';
  bool get isPaidDuplicate => subscriptionStatus == 'paid_duplicate';

  /// Payment finished one way or the other: stop polling the checkout.
  bool get isSettled => isActive || isPaidDuplicate;
}

class MembershipApi {
  static Future<LaunchFlags> launchFlags() async {
    try {
      final response = await DioHelper.getData(
        url: EndPoints.launchFlags,
        auth: false,
      );
      if (response.statusCode == 200 && response.data is Map) {
        final map = Map<String, dynamic>.from(response.data as Map);
        return LaunchFlags(
          customerMembership: map['customerMembership'] == true,
          skipcash: map['skipcash'] == true,
        );
      }
    } catch (_) {}
    return LaunchFlags.off;
  }

  static Future<bool> isEnabled() async {
    final flags = await launchFlags();
    if (flags.customerMembership) return true;
    // Production Railway is still on a build without this flag.
    // Keep the Settings entry visible while developing in Chrome / debug.
    return kDebugMode;
  }

  static Future<List<MembershipPlan>> plans() async {
    final response = await DioHelper.getData(url: EndPoints.membershipPlans, auth: true);
    if (response.statusCode != 200 || response.data is! Map) return [];
    final list = (response.data as Map)['plans'];
    if (list is! List) return [];
    return list
        .whereType<Map>()
        .map((e) => MembershipPlan.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  static Future<List<CustomerMembership>> mine({String? vehicleId}) async {
    final response = await DioHelper.getData(
      url: EndPoints.membershipMe,
      auth: true,
      query: vehicleId == null || vehicleId.isEmpty
          ? null
          : {'vehicle_id': vehicleId},
    );
    if (response.statusCode != 200 || response.data is! Map) return [];
    final list = (response.data as Map)['subscriptions'];
    if (list is! List) return [];
    return list
        .whereType<Map>()
        .map((e) => CustomerMembership.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  static Future<SkipcashSession> checkout({
    required String planId,
    required String interval,
    required String vehicleId,
  }) async {
    final response = await DioHelper.postData(
      url: EndPoints.membershipCheckout,
      auth: true,
      data: {
        'plan_id': planId,
        'interval': interval,
        'customer_vehicle_id': vehicleId,
      },
    );
    if (response.statusCode != 200 || response.data is! Map) {
      throw Exception(
        DioHelper.errorMessage(response) ?? 'Failed to start membership checkout',
      );
    }
    return SkipcashSession.fromJson(
      Map<String, dynamic>.from(response.data as Map),
    );
  }

  static Future<MembershipStatusResult?> status(String subscriptionId) async {
    final response = await DioHelper.getData(
      url: EndPoints.membershipStatus(subscriptionId),
      auth: true,
    );
    if (response.statusCode != 200 || response.data is! Map) return null;
    final data = response.data as Map;
    return MembershipStatusResult(
      // Older servers only send `status`.
      subscriptionStatus:
          (data['subscription_status'] ?? data['status'])?.toString() ?? '',
      paymentStatus: data['payment_status']?.toString() ?? 'unpaid',
      message: data['message']?.toString(),
    );
  }

  /// True only when the membership is actually active. A captured payment is
  /// not enough: it may be a duplicate that is being refunded.
  static Future<bool> isPaid(String subscriptionId) async {
    final result = await status(subscriptionId);
    return result?.isActive ?? false;
  }

  /// Cancels at the end of the paid period (the customer saw the terms).
  static Future<void> cancel(String subscriptionId) async {
    final response = await DioHelper.postData(
      url: EndPoints.membershipCancel(subscriptionId),
      auth: true,
      data: const {'terms_accepted': true},
    );
    if (response.statusCode != 200) {
      throw Exception(DioHelper.errorMessage(response) ?? 'Failed to cancel');
    }
  }
}

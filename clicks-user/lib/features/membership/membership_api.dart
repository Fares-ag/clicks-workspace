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

  static Future<bool> isPaid(String subscriptionId) async {
    final response = await DioHelper.getData(
      url: EndPoints.membershipStatus(subscriptionId),
      auth: true,
    );
    if (response.statusCode != 200 || response.data is! Map) return false;
    final data = response.data as Map;
    return data['payment_status']?.toString() == 'paid' ||
        data['status']?.toString() == 'active';
  }

  static Future<void> cancel(String subscriptionId) async {
    final response = await DioHelper.postData(
      url: EndPoints.membershipCancel(subscriptionId),
      auth: true,
      data: const {},
    );
    if (response.statusCode != 200) {
      throw Exception(DioHelper.errorMessage(response) ?? 'Failed to cancel');
    }
  }
}

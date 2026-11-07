import '../../core/api/dio_helper.dart';
import '../../core/api/end_points.dart';
import '../../core/helper/booking_errors.dart';

class SkipcashSession {
  final bool alreadyPaid;
  final String? payUrl;
  final String? paymentId;
  final String? amount;
  final String? currency;
  final String? returnUrl;
  final String? paymentMethod;
  final String? subscriptionId;

  const SkipcashSession({
    required this.alreadyPaid,
    this.payUrl,
    this.paymentId,
    this.amount,
    this.currency,
    this.returnUrl,
    this.paymentMethod,
    this.subscriptionId,
  });

  factory SkipcashSession.fromJson(Map<String, dynamic> json) {
    return SkipcashSession(
      alreadyPaid: json['already_paid'] == true ||
          json['payment_status']?.toString() == 'paid',
      payUrl: json['pay_url']?.toString(),
      paymentId: json['payment_id']?.toString(),
      amount: json['amount']?.toString(),
      currency: json['currency']?.toString(),
      returnUrl: json['return_url']?.toString(),
      paymentMethod: json['payment_method']?.toString(),
      subscriptionId: json['subscription_id']?.toString(),
    );
  }
}

class SkipcashApi {
  static Future<SkipcashSession> createSession(String jobId) async {
    final response = await DioHelper.postData(
      url: EndPoints.skipcashSession(jobId),
      auth: true,
      data: const {},
    );
    if (response.statusCode != 200) {
      throw Exception(
        errorMessageForResponse(response, fallbackKey: 'errors.card_payment_start_failed'),
      );
    }
    final data = response.data;
    if (data is! Map) {
      throw Exception(errorMessageForCode(null, fallbackKey: 'errors.card_payment_start_failed'));
    }
    return SkipcashSession.fromJson(Map<String, dynamic>.from(data));
  }

  static Future<bool> isPaid(String jobId) async {
    final response = await DioHelper.getData(
      url: EndPoints.skipcashStatus(jobId),
      auth: true,
    );
    if (response.statusCode != 200) return false;
    final data = response.data;
    if (data is! Map) return false;
    return data['payment_status']?.toString() == 'paid';
  }
}

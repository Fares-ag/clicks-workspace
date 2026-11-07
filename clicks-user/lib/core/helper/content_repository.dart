// lib/core/services/content_repository.dart

import 'package:dio/dio.dart';
import '../api/dio_helper.dart';
import '../api/end_points.dart';
import 'booking_errors.dart';
import 'content_models.dart';

class ContentRepository {
  //! ==================== GET FAQs ====================

  Future<FaqsResponse> getFaqs() async {
    try {
      final response = await DioHelper.getData(
        url: EndPoints.faqs,
        auth: false,
      );

      if (response.statusCode == 200) {
        return FaqsResponse.fromJson(response.data);
      } else {
        throw response.data['message'] ?? 'Failed to load FAQs';
      }
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  //! ==================== GET PRIVACY POLICY ====================

  Future<PrivacyPolicyResponse> getPrivacyPolicy() async {
    try {
      final response = await DioHelper.getData(
        url: EndPoints.privacyPolicy,
        auth: false,
      );

      if (response.statusCode == 200) {
        return PrivacyPolicyResponse.fromJson(response.data);
      } else {
        throw response.data['message'] ?? 'Failed to load Privacy Policy';
      }
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  //! ==================== GET TERMS AND CONDITIONS ====================

  Future<TermsConditionsResponse> getTermsConditions() async {
    try {
      final response = await DioHelper.getData(
        url: EndPoints.termsConditions,
        auth: false,
      );

      if (response.statusCode == 200) {
        return TermsConditionsResponse.fromJson(response.data);
      } else {
        throw response.data['message'] ?? 'Failed to load Terms and Conditions';
      }
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  //! ==================== CONTACT US ====================

  /// Returns the ticket number the server assigned (e.g. "CU-000042").
  /// [category] is the stable code; callers that only have a translated
  /// label can omit it and the server maps the label (en or ar) to a code.
  Future<String?> submitContactUs({
    String? category,
    required String issue,
    required String description,
  }) async {
    try {
      final response = await DioHelper.postData(
        url: EndPoints.contactUs,
        data: {
          if (category != null) 'category': category,
          'issue': issue,
          'description': description,
        },
        auth: true,
      );

      if (response.statusCode != 200 && response.statusCode != 201) {
        // The API's message lives under `error`, and is shown via its code.
        throw errorMessageForResponse(response);
      }
      final data = response.data;
      return data is Map ? data['ticket_number']?.toString() : null;
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  //! ==================== MY REQUESTS ====================

  Future<List<Map<String, dynamic>>> getMyRequests() async {
    try {
      final response = await DioHelper.getData(url: EndPoints.contactUs);
      if (response.statusCode != 200) {
        throw errorMessageForResponse(response);
      }
      final list = response.data is Map ? response.data['requests'] : null;
      if (list is! List) return const [];
      return list
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  //! ==================== ERROR HANDLER ====================

  String _handleError(DioException e) => errorMessageForException(e);
}

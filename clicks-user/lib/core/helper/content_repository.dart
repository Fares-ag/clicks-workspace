// lib/core/services/content_repository.dart

import 'package:dio/dio.dart';
import '../api/dio_helper.dart';
import '../api/end_points.dart';
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

  Future<void> submitContactUs({
    required String issue,
    required String description,
  }) async {
    try {
      final response = await DioHelper.postData(
        url: EndPoints.contactUs,
        data: {'issue': issue, 'description': description},
        auth: true,
      );

      if (response.statusCode != 200 && response.statusCode != 201) {
        throw response.data['message'] ?? 'Failed to submit contact request';
      }
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  //! ==================== ERROR HANDLER ====================

  String _handleError(DioException e) {
    if (e.response != null) {
      final data = e.response!.data;
      if (data is Map && data.containsKey('message')) {
        return data['message'];
      }
      return 'Server error: ${e.response!.statusCode}';
    } else if (e.type == DioExceptionType.connectionTimeout) {
      return 'Connection timeout. Please check your internet.';
    } else if (e.type == DioExceptionType.receiveTimeout) {
      return 'Server took too long to respond.';
    } else if (e.type == DioExceptionType.unknown) {
      return 'No internet connection.';
    }
    return 'An unexpected error occurred.';
  }
}

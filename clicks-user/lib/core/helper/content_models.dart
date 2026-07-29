// lib/core/models/content_models.dart

// ==================== FAQ Model ====================

class FaqModel {
  final String id;
  final String question;
  final String answer;
  final String category;
  final int order;
  final bool isActive;

  FaqModel({
    required this.id,
    required this.question,
    required this.answer,
    required this.category,
    required this.order,
    required this.isActive,
  });

  factory FaqModel.fromJson(Map<String, dynamic> json) {
    return FaqModel(
      id: json['_id'] ?? '',
      question: json['question'] ?? '',
      answer: json['answer'] ?? '',
      category: json['category'] ?? '',
      order: json['order'] ?? 0,
      isActive: json['isActive'] ?? true,
    );
  }
}

class FaqsResponse {
  final List<FaqModel> faqs;

  FaqsResponse({required this.faqs});

  factory FaqsResponse.fromJson(Map<String, dynamic> json) {
    final faqsList = json['faqs'] as List<dynamic>? ?? [];
    return FaqsResponse(
      faqs: faqsList.map((e) => FaqModel.fromJson(e)).toList(),
    );
  }
}

// ==================== Privacy Policy Model ====================

class PrivacyPolicyModel {
  final String id;
  final String content;
  final String version;
  final DateTime? effectiveDate;
  final bool isActive;

  PrivacyPolicyModel({
    required this.id,
    required this.content,
    required this.version,
    this.effectiveDate,
    required this.isActive,
  });

  factory PrivacyPolicyModel.fromJson(Map<String, dynamic> json) {
    return PrivacyPolicyModel(
      id: json['_id'] ?? '',
      content: json['content'] ?? '',
      version: json['version'] ?? '',
      effectiveDate: json['effectiveDate'] != null
          ? DateTime.tryParse(json['effectiveDate'])
          : null,
      isActive: json['isActive'] ?? true,
    );
  }
}

class PrivacyPolicyResponse {
  final PrivacyPolicyModel policy;

  PrivacyPolicyResponse({required this.policy});

  factory PrivacyPolicyResponse.fromJson(Map<String, dynamic> json) {
    return PrivacyPolicyResponse(
      policy: PrivacyPolicyModel.fromJson(json['policy'] ?? {}),
    );
  }
}

// ==================== Terms and Conditions Model ====================

class TermsConditionsModel {
  final String id;
  final String content;
  final String version;
  final DateTime? effectiveDate;
  final bool isActive;

  TermsConditionsModel({
    required this.id,
    required this.content,
    required this.version,
    this.effectiveDate,
    required this.isActive,
  });

  factory TermsConditionsModel.fromJson(Map<String, dynamic> json) {
    return TermsConditionsModel(
      id: json['_id'] ?? '',
      content: json['content'] ?? '',
      version: json['version'] ?? '',
      effectiveDate: json['effectiveDate'] != null
          ? DateTime.tryParse(json['effectiveDate'])
          : null,
      isActive: json['isActive'] ?? true,
    );
  }
}

class TermsConditionsResponse {
  final TermsConditionsModel terms;

  TermsConditionsResponse({required this.terms});

  factory TermsConditionsResponse.fromJson(Map<String, dynamic> json) {
    return TermsConditionsResponse(
      terms: TermsConditionsModel.fromJson(json['terms'] ?? {}),
    );
  }
}

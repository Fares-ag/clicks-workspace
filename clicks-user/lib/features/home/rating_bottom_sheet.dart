import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_rating_bar/flutter_rating_bar.dart';

import '../../core/api/dio_helper.dart';
import '../../core/api/end_points.dart';

/// Modal bottom sheet that asks the user to rate the technician.
/// Matches the Figma design: avatar, stars, text field, Submit button.
class RatingBottomSheet extends StatefulWidget {
  final String technicianName;
  final String technicianPhotoUrl;
  final String jobId;
  final VoidCallback onSubmitted;
  final VoidCallback onSkipped;

  const RatingBottomSheet({
    super.key,
    required this.technicianName,
    required this.technicianPhotoUrl,
    required this.jobId,
    required this.onSubmitted,
    required this.onSkipped,
  });

  @override
  State<RatingBottomSheet> createState() => _RatingBottomSheetState();
}

class _RatingBottomSheetState extends State<RatingBottomSheet> {
  double _rating = 5;
  final _reviewController = TextEditingController();
  bool _submitting = false;
  bool _submitted = false;

  Future<void> _submit() async {
    if (_submitting) return;
    setState(() => _submitting = true);

    try {
      final response = await DioHelper.postData(
        url: '${EndPoints.jobs}/${widget.jobId}/rate',
        data: {
          'rating': _rating.toInt(),
          'rating_description': _reviewController.text.trim(),
        },
      );
      if (!mounted) return;
      if (response.statusCode != 200) {
        setState(() => _submitting = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              response.data is Map && response.data['error'] != null
                  ? response.data['error'].toString()
                  : 'rating.failed_submit'.tr(),
            ),
          ),
        );
        return;
      }
      setState(() => _submitted = true);

      // Show thank-you for 1.5s then close
      await Future.delayed(const Duration(milliseconds: 1500));
      if (!mounted) return;
      widget.onSubmitted();
    } catch (e) {
      if (!mounted) return;
      setState(() => _submitting = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('${'rating.failed_submit'.tr()}: $e')),
      );
    }
  }

  @override
  void dispose() {
    _reviewController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final bottomPadding = MediaQuery.of(context).viewInsets.bottom;

    if (_submitted) {
      return _ThankYouView(onDone: widget.onSubmitted);
    }

    return Container(
      padding: EdgeInsets.only(bottom: bottomPadding),
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Handle
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: const Color(0xFFD0D5DD),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),

              // Close button
              Align(
                alignment: Alignment.topRight,
                child: GestureDetector(
                  onTap: widget.onSkipped,
                  child: const Padding(
                    padding: EdgeInsets.only(top: 8),
                    child:
                        Icon(Icons.close, color: Color(0xFF98A2B3), size: 22),
                  ),
                ),
              ),

              const SizedBox(height: 8),

              // Avatar
              CircleAvatar(
                radius: 36,
                backgroundColor: const Color(0xFFE5E7EB),
                backgroundImage: widget.technicianPhotoUrl.isNotEmpty
                    ? NetworkImage(widget.technicianPhotoUrl)
                    : null,
                child: widget.technicianPhotoUrl.isEmpty
                    ? const Icon(Icons.person, size: 36, color: Colors.grey)
                    : null,
              ),

              const SizedBox(height: 16),

              // Title
              Text(
                'rating.how_was_experience'.tr(namedArgs: {'name': widget.technicianName}),
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w600,
                  color: Color(0xFF111827),
                  height: 1.3,
                ),
              ),

              const SizedBox(height: 20),

              // Stars
              RatingBar.builder(
                initialRating: _rating,
                minRating: 1,
                direction: Axis.horizontal,
                allowHalfRating: false,
                itemCount: 5,
                itemSize: 42,
                unratedColor: const Color(0xFFE5E7EB),
                itemPadding: const EdgeInsets.symmetric(horizontal: 6),
                itemBuilder: (context, _) =>
                    const Icon(Icons.star, color: Color(0xFFF59E0B)),
                onRatingUpdate: (rating) {
                  setState(() => _rating = rating);
                },
              ),

              const SizedBox(height: 24),

              // "Tell us a little more"
              Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  'rating.tell_us_more'.tr(),
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFF111827),
                  ),
                ),
              ),

              const SizedBox(height: 8),

              // Text field
              TextField(
                controller: _reviewController,
                maxLines: 3,
                decoration: InputDecoration(
                  hintText: 'rating.write_review_hint'.tr(),
                  hintStyle: const TextStyle(
                    fontSize: 14,
                    color: Color(0xFF98A2B3),
                  ),
                  contentPadding: const EdgeInsets.all(14),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(color: Color(0xFFD0D5DD)),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(color: Color(0xFFD0D5DD)),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(color: Color(0xFF8B1A1B)),
                  ),
                ),
              ),

              const SizedBox(height: 24),

              // Submit button
              SizedBox(
                width: double.infinity,
                height: 52,
                child: ElevatedButton(
                  onPressed: _submitting ? null : _submit,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF8B1A1B),
                    disabledBackgroundColor: const Color(0xFF8B1A1B).withValues(alpha: 0.5),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                    elevation: 0,
                  ),
                  child: _submitting
                      ? const SizedBox(
                          width: 24,
                          height: 24,
                          child: CircularProgressIndicator(
                            color: Colors.white,
                            strokeWidth: 2.5,
                          ),
                        )
                      : Text(
                          'rating.submit'.tr(),
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                          ),
                        ),
                ),
              ),

              const SizedBox(height: 16),
            ],
          ),
        ),
      ),
    );
  }
}

/// Thank-you view shown after successful submission.
class _ThankYouView extends StatelessWidget {
  final VoidCallback onDone;
  const _ThankYouView({required this.onDone});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 40),
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 70,
            height: 70,
            decoration: const BoxDecoration(
              color: Color(0xFF0D5F2C),
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.check, color: Colors.white, size: 36),
          ),
          const SizedBox(height: 20),
          Text(
            'rating.thank_you_review'.tr(),
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.w700,
              color: Color(0xFF111827),
            ),
          ),
          const SizedBox(height: 10),
          Text(
            'rating.feedback_helps'.tr(),
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 14,
              color: Color(0xFF6B7280),
            ),
          ),
          const SizedBox(height: 30),
        ],
      ),
    );
  }
}

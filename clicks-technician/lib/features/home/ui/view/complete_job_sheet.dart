import 'package:clicks_technician/core/components/app_button.dart';
import 'package:clicks_technician/core/config/product_rules.dart';
import 'package:clicks_technician/core/helper/app_snack_bars.dart';
import 'package:clicks_technician/core/helper/cache_helper.dart';
import 'package:clicks_technician/core/theme/colors_manager.dart';
import 'package:clicks_technician/core/theme/text_styles.dart';
import 'package:clicks_technician/features/home/ui/cubit/home_cubit.dart';
import 'package:clicks_technician/features/home/ui/view/widgets/signature_pad_sheet.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

/// Notes, customer signature, complete.
class BeginTasksScreen extends StatefulWidget {
  const BeginTasksScreen({super.key, required this.cubit});

  final HomeCubit cubit;

  @override
  State<BeginTasksScreen> createState() => _BeginTasksScreenState();
}

class _BeginTasksScreenState extends State<BeginTasksScreen> {
  final _notesCtrl = TextEditingController();
  final _jobRefCtrl = TextEditingController();
  bool _submitting = false;
  String? _jobRefError;
  bool _draftCleared = false;

  /// Job this sheet was opened for. Pinned once: the 25s session poll keeps
  /// reassigning [HomeCubit.activeJob] while the sheet is open.
  String? _jobId;

  String get _draftKey => 'task_draft_${_jobId ?? 'none'}';
  String get _jobRefDraftKey => 'task_job_ref_${_jobId ?? 'none'}';

  /// The pinned job, looked up from the live session so guards never read a
  /// job the poll swapped in behind the sheet.
  Map<String, dynamic>? get _job {
    final active = widget.cubit.activeJob;
    if (_jobId == null) return active;
    if ((active?['_id'] ?? active?['job_id'])?.toString() == _jobId) {
      return active;
    }
    for (final j in widget.cubit.activeJobs) {
      if ((j['_id'] ?? j['job_id'])?.toString() == _jobId) return j;
    }
    return null;
  }

  bool get _isPaid => _job?['payment_status']?.toString() == 'paid';

  bool _hasValidSignature() {
    return (_job?['customerSignatureUrl']?.toString().isNotEmpty ?? false) &&
        !widget.cubit.signatureClearedBanner;
  }

  @override
  void initState() {
    super.initState();
    _jobId = widget.cubit.jobId;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (!_isPaid) {
        AppSnackBars.errorSnackBar(
          'Collect payment before completing the job',
        );
        Navigator.of(context).pop();
      }
    });
    _restoreDraft();
  }

  Future<void> _restoreDraft() async {
    final notes = CacheHelper.get(_draftKey)?.toString();
    if (notes != null && notes.isNotEmpty) {
      _notesCtrl.text = notes;
    }
    final jobRef = CacheHelper.get(_jobRefDraftKey)?.toString();
    if (jobRef != null && jobRef.isNotEmpty) {
      _jobRefCtrl.text = jobRef;
    } else {
      // No local draft (reinstall / other device): fall back to the Job ID the
      // server already holds so a re-completion cannot blank it out.
      final saved = _job?['job_reference']?.toString() ?? '';
      if (saved.isNotEmpty) {
        _jobRefCtrl.text = saved;
      }
    }
  }

  Future<void> _saveDraft() async {
    await CacheHelper.save(_draftKey, _notesCtrl.text.trim());
    await CacheHelper.save(_jobRefDraftKey, _jobRefCtrl.text.trim());
    if (mounted) {
      AppSnackBars.successSnackBar('Progress saved');
    }
  }

  Future<void> _collectSignature() async {
    await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16.r)),
      ),
      builder: (_) => SignaturePadSheet(cubit: widget.cubit),
    );
    if (mounted) setState(() {});
  }

  Future<void> _complete() async {
    final jobReference = _jobRefCtrl.text.trim();
    if (jobReference.isEmpty) {
      setState(() => _jobRefError = 'Job ID is required');
      AppSnackBars.errorSnackBar('Enter the Job ID before completing');
      return;
    }
    if (_jobRefError != null) {
      setState(() => _jobRefError = null);
    }
    if (ProductRules.requireSignatureBeforeComplete) {
      var hasSig = _hasValidSignature();
      if (!hasSig) {
        AppSnackBars.errorSnackBar('Customer signature is required');
        await _collectSignature();
        hasSig = _hasValidSignature();
        if (!hasSig) return;
      }
    }
    setState(() => _submitting = true);
    if (!_isPaid) {
      setState(() => _submitting = false);
      AppSnackBars.errorSnackBar(
        'Collect payment before completing the job',
      );
      if (mounted) Navigator.pop(context);
      return;
    }
    // Snapshot the draft keys: completing clears activeJob, and the keys must
    // still resolve to this job's entries afterwards.
    final draftKey = _draftKey;
    final jobRefDraftKey = _jobRefDraftKey;
    final ok = await widget.cubit.completeJob(
      notes: _notesCtrl.text.trim(),
      jobReference: jobReference,
      jobId: _jobId,
    );
    if (!mounted) return;
    setState(() => _submitting = false);
    if (!ok) {
      AppSnackBars.errorSnackBar(
        widget.cubit.lastActionError ??
            'Could not complete — collect payment and customer signature first',
      );
      return;
    }
    _draftCleared = true;
    await CacheHelper.remove(draftKey);
    await CacheHelper.remove(jobRefDraftKey);
    if (mounted) Navigator.pop(context);
  }

  @override
  void dispose() {
    // Keep a typed Job ID across sheet closes, same as the notes draft.
    if (!_draftCleared) {
      final jobReference = _jobRefCtrl.text.trim();
      if (jobReference.isNotEmpty) {
        // ignore: discarded_futures
        CacheHelper.save(_jobRefDraftKey, jobReference);
      }
    }
    _jobRefCtrl.dispose();
    _notesCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        title: Text(
          'Complete Job',
          style: TextStyles.font16RegularBlack
              .copyWith(fontWeight: FontWeight.bold),
        ),
      ),
      body: ListView(
        padding: EdgeInsets.fromLTRB(16.w, 8.h, 16.w, 24.h),
        children: [
          Text(
            widget.cubit.jobIssue,
            style: TextStyles.font14RegularGrey.copyWith(color: Colors.black87),
          ),
          SizedBox(height: 16.h),
          Text(
            'Job ID',
            style: TextStyles.font16RegularBlack
                .copyWith(fontWeight: FontWeight.w600),
          ),
          SizedBox(height: 8.h),
          TextField(
            controller: _jobRefCtrl,
            maxLength: 64,
            textInputAction: TextInputAction.next,
            // Finance identifier — never let the IME rewrite what was typed.
            autocorrect: false,
            enableSuggestions: false,
            onChanged: (value) {
              if (_jobRefError != null && value.trim().isNotEmpty) {
                setState(() => _jobRefError = null);
              }
            },
            decoration: InputDecoration(
              hintText: 'Enter the Job ID',
              errorText: _jobRefError,
              counterText: '',
              filled: true,
              fillColor: Colors.white,
              contentPadding: EdgeInsets.fromLTRB(12.w, 12.h, 12.w, 12.h),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10.r),
                borderSide: BorderSide(color: ColorsManager.border),
              ),
            ),
          ),
          SizedBox(height: 16.h),
          Text(
            'Notes',
            style: TextStyles.font16RegularBlack
                .copyWith(fontWeight: FontWeight.w600),
          ),
          SizedBox(height: 8.h),
          TextField(
            controller: _notesCtrl,
            maxLines: 3,
            decoration: InputDecoration(
              hintText: 'Add notes…',
              filled: true,
              fillColor: Colors.white,
              contentPadding: EdgeInsets.fromLTRB(12.w, 12.h, 12.w, 12.h),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10.r),
                borderSide: BorderSide(color: ColorsManager.border),
              ),
            ),
          ),
          SizedBox(height: 20.h),
          if (widget.cubit.signatureClearedBanner)
            Container(
              width: double.infinity,
              padding: EdgeInsets.all(10.w),
              margin: EdgeInsets.only(bottom: 10.h),
              decoration: BoxDecoration(
                color: const Color(0xFFFFFAEB),
                borderRadius: BorderRadius.circular(8.r),
              ),
              child: Text(
                'Job details changed — customer must sign again.',
                style: TextStyles.font12RegularGrey
                    .copyWith(color: const Color(0xFFB54708)),
              ),
            ),
          if (!_hasValidSignature()) ...[
            OutlinedButton(
              onPressed: _submitting ? null : _collectSignature,
              style: OutlinedButton.styleFrom(
                minimumSize: Size(double.infinity, 48.h),
                side: BorderSide(color: ColorsManager.border),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10.r),
                ),
              ),
              child: Text(
                'Collect customer signature',
                style: TextStyles.font14RegularGrey
                    .copyWith(color: Colors.black87),
              ),
            ),
            SizedBox(height: 10.h),
          ],
          OutlinedButton(
            onPressed: _submitting ? null : _saveDraft,
            style: OutlinedButton.styleFrom(
              minimumSize: Size(double.infinity, 48.h),
              side: BorderSide(color: ColorsManager.border),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10.r),
              ),
            ),
            child: Text('Save Progress',
                style: TextStyles.font14RegularGrey
                    .copyWith(color: Colors.black87)),
          ),
          SizedBox(height: 10.h),
          AppButton(
            isLoading: _submitting || widget.cubit.isLoadingAction,
            onPressed: (_submitting || !_isPaid) ? null : _complete,
            label: 'Complete Job',
            margin: 0,
            width: double.infinity,
            bgColor: ColorsManager.mainColor,
            textColor: Colors.white,
            height: 48.h,
            radius: 10.r,
          ),
        ],
      ),
    );
  }
}

/// Legacy sheet wrapper (unused by new flow; kept for imports).
class CompleteJobSheet extends StatelessWidget {
  const CompleteJobSheet({
    super.key,
    required this.price,
    required this.issue,
    required this.isLoading,
    required this.onSubmit,
  });

  final double? price;
  final String issue;
  final bool isLoading;
  final Future<bool> Function({
    required String notes,
    required List<String> photoLabels,
  }) onSubmit;

  @override
  Widget build(BuildContext context) {
    return const SizedBox.shrink();
  }
}

import 'dart:io';

import 'package:clicks_technician/core/components/app_button.dart';
import 'package:clicks_technician/core/config/product_rules.dart';
import 'package:clicks_technician/core/helper/app_snack_bars.dart';
import 'package:clicks_technician/core/helper/cache_helper.dart';
import 'package:clicks_technician/core/theme/colors_manager.dart';
import 'package:clicks_technician/core/theme/text_styles.dart';
import 'package:clicks_technician/features/home/ui/cubit/home_cubit.dart';
import 'package:clicks_technician/features/home/ui/view/widgets/signature_pad_sheet.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:image_picker/image_picker.dart';

/// Repair lines, total, notes, customer signature, complete.
class BeginTasksScreen extends StatefulWidget {
  const BeginTasksScreen({super.key, required this.cubit});

  final HomeCubit cubit;

  @override
  State<BeginTasksScreen> createState() => _BeginTasksScreenState();
}

class _BeginTasksScreenState extends State<BeginTasksScreen> {
  final _notesCtrl = TextEditingController();
  final _descCtrl = TextEditingController();
  final _priceCtrl = TextEditingController();
  final _picker = ImagePicker();
  final List<XFile> _photos = [];
  final List<({String description, double price})> _repairs = [];
  bool _listening = false;
  bool _submitting = false;
  double? _total;

  String get _draftKey => 'task_draft_${widget.cubit.jobId ?? 'none'}';

  @override
  void initState() {
    super.initState();
    _restoreDraft();
    _refreshTotal();
  }

  Future<void> _restoreDraft() async {
    final notes = CacheHelper.get(_draftKey)?.toString();
    if (notes != null && notes.isNotEmpty) {
      _notesCtrl.text = notes;
    }
  }

  Future<void> _saveDraft() async {
    await CacheHelper.save(_draftKey, _notesCtrl.text.trim());
    if (mounted) {
      AppSnackBars.successSnackBar('Progress saved');
    }
  }

  Future<void> _refreshTotal() async {
    final t = await widget.cubit.fetchJobTotal();
    if (mounted) setState(() => _total = t);
  }

  Future<void> _addRepair() async {
    final desc = _descCtrl.text.trim();
    final price = double.tryParse(_priceCtrl.text.trim());
    if (desc.isEmpty || price == null) {
      AppSnackBars.errorSnackBar('Enter procedure and price');
      return;
    }
    final ok = await widget.cubit.addRepairProcedure(
      description: desc,
      price: price,
    );
    if (!ok) {
      AppSnackBars.errorSnackBar('Could not add repair');
      return;
    }
    setState(() {
      _repairs.add((description: desc, price: price));
      _descCtrl.clear();
      _priceCtrl.clear();
    });
    await _refreshTotal();
  }

  Future<void> _pickPhoto() async {
    if (_photos.length >= 5) return;
    final file = await _picker.pickImage(
      source: ImageSource.gallery,
      imageQuality: 75,
    );
    if (file != null && mounted) setState(() => _photos.add(file));
  }

  Future<void> _toggleVoice() async {
    if (_listening) {
      setState(() => _listening = false);
      _appendVoiceMarker();
      return;
    }
    setState(() => _listening = true);
    await Future<void>.delayed(const Duration(milliseconds: 900));
    if (mounted && _listening) {
      setState(() => _listening = false);
      _appendVoiceMarker();
    }
  }

  void _appendVoiceMarker() {
    final existing = _notesCtrl.text.trim();
    const marker = 'Voice note recorded';
    _notesCtrl.text = existing.isEmpty ? marker : '$existing\n$marker';
    _notesCtrl.selection =
        TextSelection.collapsed(offset: _notesCtrl.text.length);
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
    if (ProductRules.requireSignatureBeforeComplete) {
      final hasSig = (widget.cubit.activeJob?['customerSignatureUrl']
                  ?.toString()
                  .isNotEmpty ??
              false) &&
          !widget.cubit.signatureClearedBanner;
      if (!hasSig) {
        AppSnackBars.errorSnackBar('Customer signature is required');
        await _collectSignature();
        return;
      }
    }
    setState(() => _submitting = true);
    final ok = await widget.cubit.completeJob(
      notes: _notesCtrl.text.trim(),
      photoLabels: _photos.map((e) => e.name).toList(),
    );
    setState(() => _submitting = false);
    if (!ok || !mounted) {
      if (mounted) {
        AppSnackBars.errorSnackBar(
          'Could not complete — check signature and try again',
        );
      }
      return;
    }
    await CacheHelper.remove(_draftKey);
    if (mounted) Navigator.pop(context);
  }

  @override
  void dispose() {
    _notesCtrl.dispose();
    _descCtrl.dispose();
    _priceCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final displayTotal = _total ?? widget.cubit.jobPrice;

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        title: Text(
          'Start Job',
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
            'Repair Procedures',
            style: TextStyles.font16RegularBlack
                .copyWith(fontWeight: FontWeight.w600),
          ),
          SizedBox(height: 8.h),
          ..._repairs.map(
            (r) => Padding(
              padding: EdgeInsets.only(bottom: 8.h),
              child: _box(
                child: Row(
                  children: [
                    Expanded(
                      child: Text(r.description,
                          style: TextStyles.font14RegularGrey
                              .copyWith(color: Colors.black87)),
                    ),
                    Text(
                      'QAR ${r.price.toStringAsFixed(0)}',
                      style: TextStyles.font14RegularGrey
                          .copyWith(fontWeight: FontWeight.w600),
                    ),
                  ],
                ),
              ),
            ),
          ),
          Row(
            children: [
              Expanded(
                flex: 2,
                child: TextField(
                  controller: _descCtrl,
                  decoration: InputDecoration(
                    hintText: 'Procedure',
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10.r),
                    ),
                    contentPadding: EdgeInsets.symmetric(
                        horizontal: 12.w, vertical: 12.h),
                  ),
                ),
              ),
              SizedBox(width: 8.w),
              Expanded(
                child: TextField(
                  controller: _priceCtrl,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(
                    hintText: 'Price',
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10.r),
                    ),
                    contentPadding: EdgeInsets.symmetric(
                        horizontal: 12.w, vertical: 12.h),
                  ),
                ),
              ),
            ],
          ),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton(
              onPressed: _addRepair,
              style: TextButton.styleFrom(
                foregroundColor: ColorsManager.mainColor,
              ),
              child: const Text('+ Add procedure'),
            ),
          ),
          SizedBox(height: 8.h),
          Text(
            'Choose File',
            style: TextStyles.font14RegularGrey
                .copyWith(fontWeight: FontWeight.w600),
          ),
          SizedBox(height: 8.h),
          ..._photos.map((p) {
            return Padding(
              padding: EdgeInsets.only(bottom: 8.h),
              child: _box(
                child: Row(
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(6.r),
                      child: SizedBox(
                        width: 40.w,
                        height: 40.w,
                        child: kIsWeb
                            ? ColoredBox(
                                color: ColorsManager.fieldColor,
                                child: Icon(Icons.image,
                                    color: ColorsManager.greyColor,
                                    size: 20.sp),
                              )
                            : Image.file(File(p.path), fit: BoxFit.cover),
                      ),
                    ),
                    SizedBox(width: 10.w),
                    Expanded(
                      child: Text(
                        p.name,
                        style: TextStyles.font12RegularGrey
                            .copyWith(color: Colors.black87),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    IconButton(
                      icon: Icon(Icons.delete_outline,
                          color: ColorsManager.mainColor, size: 20.sp),
                      onPressed: () => setState(() => _photos.remove(p)),
                    ),
                  ],
                ),
              ),
            );
          }),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton(
              onPressed: _pickPhoto,
              style: TextButton.styleFrom(
                backgroundColor: ColorsManager.mainColor,
                foregroundColor: Colors.white,
              ),
              child: const Text('+ Add'),
            ),
          ),
          SizedBox(height: 8.h),
          Text(
            'Total Cost',
            style: TextStyles.font16RegularBlack
                .copyWith(fontWeight: FontWeight.w600),
          ),
          SizedBox(height: 8.h),
          _box(
            child: Text(
              displayTotal == null
                  ? 'QAR —'
                  : 'QAR ${displayTotal.toStringAsFixed(0)}',
              style: TextStyles.font14RegularGrey
                  .copyWith(color: Colors.black87, fontWeight: FontWeight.w600),
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
              contentPadding: EdgeInsets.fromLTRB(12.w, 12.h, 48.w, 12.h),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10.r),
                borderSide: BorderSide(color: ColorsManager.border),
              ),
              suffixIcon: Padding(
                padding: EdgeInsets.only(right: 6.w),
                child: InkWell(
                  onTap: _toggleVoice,
                  borderRadius: BorderRadius.circular(20.r),
                  child: CircleAvatar(
                    radius: 18.r,
                    backgroundColor: _listening
                        ? const Color(0xFFD92D20)
                        : ColorsManager.mainColor,
                    child: Icon(
                      _listening ? Icons.stop_rounded : Icons.mic_rounded,
                      color: Colors.white,
                      size: 18.sp,
                    ),
                  ),
                ),
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
              ((widget.cubit.activeJob?['customerSignatureUrl']
                              ?.toString()
                              .isNotEmpty ??
                          false) &&
                      !widget.cubit.signatureClearedBanner)
                  ? 'Signature collected ✓'
                  : 'Collect customer signature',
              style: TextStyles.font14RegularGrey
                  .copyWith(color: Colors.black87),
            ),
          ),
          SizedBox(height: 10.h),
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
            onPressed: _submitting ? null : _complete,
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

  Widget _box({required Widget child}) {
    return Container(
      width: double.infinity,
      padding: EdgeInsets.symmetric(horizontal: 12.w, vertical: 12.h),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(10.r),
        border: Border.all(color: ColorsManager.border),
      ),
      child: child,
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

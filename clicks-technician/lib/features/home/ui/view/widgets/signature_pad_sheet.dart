import 'dart:ui' as ui;

import 'package:clicks_technician/core/components/app_button.dart';
import 'package:clicks_technician/core/helper/app_snack_bars.dart';
import 'package:clicks_technician/core/theme/colors_manager.dart';
import 'package:clicks_technician/core/theme/text_styles.dart';
import 'package:clicks_technician/features/home/ui/cubit/home_cubit.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

/// Lightweight signature capture — no extra package.
class SignaturePadSheet extends StatefulWidget {
  const SignaturePadSheet({super.key, required this.cubit});

  final HomeCubit cubit;

  @override
  State<SignaturePadSheet> createState() => _SignaturePadSheetState();
}

class _SignaturePadSheetState extends State<SignaturePadSheet> {
  final _points = <Offset?>[];
  final _repaintKey = GlobalKey();
  bool _saving = false;

  Future<void> _save() async {
    if (_points.whereType<Offset>().length < 5) {
      AppSnackBars.errorSnackBar('Please provide a signature');
      return;
    }
    setState(() => _saving = true);
    try {
      final boundary = _repaintKey.currentContext!.findRenderObject()
          as RenderRepaintBoundary;
      final image = await boundary.toImage(pixelRatio: 2);
      final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
      if (bytes == null) {
        AppSnackBars.errorSnackBar('Failed to save signature');
        return;
      }
      final ok = await widget.cubit.uploadCustomerSignatureBytes(
        bytes.buffer.asUint8List(),
      );
      if (!mounted) return;
      if (ok) {
        Navigator.pop(context, true);
      } else {
        AppSnackBars.errorSnackBar(
          widget.cubit.lastActionError ?? 'Failed to upload signature',
        );
      }
    } catch (_) {
      AppSnackBars.errorSnackBar('Failed to save signature');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.all(16.w),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Customer signature',
              style: TextStyles.font16RegularBlack
                  .copyWith(fontWeight: FontWeight.bold),
            ),
            SizedBox(height: 8.h),
            Text(
              'Ask the customer to sign below before completing the job.',
              style: TextStyles.font12RegularGrey,
            ),
            SizedBox(height: 12.h),
            Container(
              height: 180.h,
              decoration: BoxDecoration(
                border: Border.all(color: ColorsManager.border),
                borderRadius: BorderRadius.circular(10.r),
                color: Colors.white,
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(10.r),
                child: RepaintBoundary(
                  key: _repaintKey,
                  child: GestureDetector(
                    onPanStart: (d) {
                      setState(() => _points.add(d.localPosition));
                    },
                    onPanUpdate: (d) {
                      setState(() => _points.add(d.localPosition));
                    },
                    onPanEnd: (_) => setState(() => _points.add(null)),
                    child: CustomPaint(
                      painter: _SigPainter(_points),
                      child: const SizedBox.expand(),
                    ),
                  ),
                ),
              ),
            ),
            SizedBox(height: 12.h),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed:
                        _saving ? null : () => setState(() => _points.clear()),
                    child: const Text('Clear'),
                  ),
                ),
                SizedBox(width: 12.w),
                Expanded(
                  child: AppButton(
                    isLoading: _saving,
                    onPressed: _saving ? null : _save,
                    label: 'Save signature',
                    margin: 0,
                    height: 44.h,
                    bgColor: ColorsManager.mainColor,
                    textColor: Colors.white,
                    radius: 10.r,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _SigPainter extends CustomPainter {
  _SigPainter(this.points);
  final List<Offset?> points;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.black
      ..strokeWidth = 2.5
      ..strokeCap = StrokeCap.round
      ..style = PaintingStyle.stroke;
    for (var i = 0; i < points.length - 1; i++) {
      final a = points[i];
      final b = points[i + 1];
      if (a != null && b != null) canvas.drawLine(a, b, paint);
    }
  }

  @override
  bool shouldRepaint(covariant _SigPainter oldDelegate) => true;
}

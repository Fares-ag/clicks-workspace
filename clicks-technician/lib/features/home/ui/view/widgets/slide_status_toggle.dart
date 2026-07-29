import 'package:clicks_technician/core/theme/colors_manager.dart';
import 'package:clicks_technician/core/theme/text_styles.dart';
import 'package:flutter/material.dart';

/// Figma “Switch To Offline / Online” slider — whole-track drag.
class SlideStatusToggle extends StatefulWidget {
  const SlideStatusToggle({
    super.key,
    required this.isOnline,
    required this.enabled,
    required this.loading,
    required this.onCompleted,
    this.onlineLabel = 'Switch To Offline',
    this.offlineLabel = 'Switch To Online',
  });

  final bool isOnline;
  final bool enabled;
  final bool loading;
  final VoidCallback onCompleted;
  final String onlineLabel;
  final String offlineLabel;

  @override
  State<SlideStatusToggle> createState() => _SlideStatusToggleState();
}

class _SlideStatusToggleState extends State<SlideStatusToggle> {
  double _drag = 0;

  @override
  void didUpdateWidget(covariant SlideStatusToggle oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.isOnline != widget.isOnline ||
        oldWidget.loading != widget.loading) {
      _drag = 0;
    }
  }

  @override
  Widget build(BuildContext context) {
    final label = widget.isOnline ? widget.onlineLabel : widget.offlineLabel;
    return LayoutBuilder(
      builder: (context, constraints) {
        final trackW = constraints.maxWidth;
        final knob = 40.0;
        final pad = 8.0;
        final maxDrag = (trackW - knob - pad * 2).clamp(0.0, double.infinity);
        final progress = maxDrag <= 0 ? 0.0 : (_drag / maxDrag).clamp(0.0, 1.0);

        void onUpdate(DragUpdateDetails d) {
          if (!widget.enabled || widget.loading) return;
          setState(() => _drag = (_drag + d.delta.dx).clamp(0.0, maxDrag));
        }

        void onEnd(DragEndDetails _) {
          if (!widget.enabled || widget.loading) return;
          if (progress >= 0.65) widget.onCompleted();
          setState(() => _drag = 0);
        }

        return Opacity(
          opacity: widget.enabled && !widget.loading ? 1 : 0.55,
          child: GestureDetector(
            onHorizontalDragUpdate: onUpdate,
            onHorizontalDragEnd: onEnd,
            child: Container(
              height: 56,
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(64),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.12),
                    blurRadius: 12,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Stack(
                alignment: Alignment.center,
                children: [
                  Padding(
                    padding: EdgeInsets.symmetric(horizontal: knob + 12),
                    child: Text(
                      label,
                      textAlign: TextAlign.center,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyles.font16RegularBlack.copyWith(
                        color: const Color(0xFF252525),
                        fontWeight: FontWeight.w500,
                        fontSize: 16,
                      ),
                    ),
                  ),
                  if (widget.loading)
                    const Positioned(
                      right: 16,
                      child: SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: ColorsManager.mainColor,
                        ),
                      ),
                    ),
                  Positioned(
                    left: pad + _drag,
                    child: Container(
                      width: knob,
                      height: knob,
                      decoration: BoxDecoration(
                        color: ColorsManager.mainColor,
                        shape: BoxShape.circle,
                        boxShadow: [
                          BoxShadow(
                            color: const Color(0xFF010114).withValues(alpha: 0.35),
                            blurRadius: 15,
                            offset: const Offset(0, 8),
                          ),
                        ],
                      ),
                      child: const Icon(
                        Icons.chevron_right_rounded,
                        color: Colors.white,
                        size: 28,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

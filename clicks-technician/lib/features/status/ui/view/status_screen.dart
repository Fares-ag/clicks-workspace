import 'dart:ui';

import 'package:clicks_technician/core/theme/colors_manager.dart';
import 'package:clicks_technician/features/status/ui/cubit/status_cubit.dart';
import 'package:clicks_technician/features/status/ui/view/widgets/approved_status_widget.dart';
import 'package:clicks_technician/features/status/ui/view/widgets/pending_status_widget.dart';
import 'package:clicks_technician/features/status/ui/view/widgets/rejected_status_widget.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

class StatusScreen extends StatelessWidget {
  const StatusScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: <Widget>[
          Column(
            children: [
              Container(
                width: double.infinity,
                height: 50,
                color: ColorsManager.mainColor.withAlpha(150),
              ),
              Container(
                width: double.infinity,
                height: 50,
                color: Colors.grey.withAlpha(150),
              ),
            ],
          ),

          // Blur effect
          Positioned.fill(
            child: ClipRect(
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 10.0, sigmaY: 10.0),
                child: Container(
                  color: Colors.black.withValues(alpha: 0.1),
                ),
              ),
            ),
          ),
          // Your content on top
          BlocConsumer<StatusCubit, StatusState>(
            listener: (context, state) {
              context.read<StatusCubit>().goHomeIfApproved(context);
            },
            builder: (context, state) {
              switch (context.read<StatusCubit>().currentStatus) {
                case StatusType.pending:
                  return PendingStatusWidget();
                case StatusType.approved:
                  return ApprovedStatusWidget();
                case StatusType.rejected:
                  return RejectedStatusWidget();
              }
            },
          ),
        ],
      ),
    );
  }
}

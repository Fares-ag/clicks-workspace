import 'package:clicks_technician/core/helper/assets_manager.dart';
import 'package:clicks_technician/core/helper/extensions.dart';
import 'package:clicks_technician/core/theme/colors_manager.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:image_picker/image_picker.dart';

import '../../../../../../core/theme/text_styles.dart';

class RegisterChooseFileView extends StatefulWidget {
  const RegisterChooseFileView({
    super.key,
    required this.label,
    required this.chooseFile,
    this.chosenFile,
  });
  final String label;
  final Function(XFile? fileChosen) chooseFile;
  final XFile? chosenFile;

  @override
  State<RegisterChooseFileView> createState() => _RegisterChooseFileViewState();
}

class _RegisterChooseFileViewState extends State<RegisterChooseFileView> {
  XFile? file;

  @override
  void initState() {
    if (widget.chosenFile != null) {
      file = widget.chosenFile;
    }
    super.initState();
  }

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () {
        _showSelectDialog();
      },
      child:
          file == null
              ? Container(
                padding: EdgeInsets.all(16),
                decoration: BoxDecoration(
                  border: Border.all(color: Color(0xffE2E8F0)),
                  borderRadius: BorderRadius.circular(8.r),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      widget.label,
                      style: TextStyles.font16RegularBlack.copyWith(
                        color: Colors.grey,
                      ),
                    ),
                    SvgPicture.asset(AssetsManager.uploadSvg),
                  ],
                ),
              )
              : Container(
                padding: EdgeInsets.all(16),
                decoration: BoxDecoration(
                  border: Border.all(color: Color(0xffE2E8F0)),
                  borderRadius: BorderRadius.circular(8.r),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: Text(
                        file?.name ?? "",
                        style: TextStyles.font16RegularBlack,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    SizedBox(width: 16.w),
                    Row(
                      children: [
                        Icon(Icons.visibility_outlined),
                        InkWell(
                          onTap: () {
                            file = null;
                            widget.chooseFile(null);
                            setState(() {});
                          },
                          child: Icon(Icons.delete_outline),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
    );
  }

  void _showSelectDialog() async {
    await showGeneralDialog(
      context: context,
      barrierDismissible: false,
      barrierLabel: '',
      barrierColor: Colors.black54,
      transitionDuration: Duration(milliseconds: 300),
      pageBuilder: (context, animation1, animation2) {
        return Container();
      },
      transitionBuilder: (context, animation1, animation2, widget) {
        return ScaleTransition(
          scale: Tween<double>(begin: 0.5, end: 1.0).animate(
            CurvedAnimation(parent: animation1, curve: Curves.elasticOut),
          ),
          child: AlertDialog(
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(25),
            ),
            elevation: 15,
            backgroundColor: Colors.white,
            contentPadding: EdgeInsets.all(25),
            title: Column(
              children: [
                InkWell(
                  onTap: () async {
                    var image = await ImagePicker().pickImage(
                      source: ImageSource.gallery,
                    );
                    if (image != null) {
                      file = image;
                    }

                    setState(() {});

                    if (context.mounted) context.pop();
                  },
                  child: Container(
                    padding: EdgeInsets.all(15),
                    decoration: BoxDecoration(
                      color: Color(0xffE4E7EC),
                      shape: BoxShape.circle,
                    ),
                    child: SvgPicture.asset(AssetsManager.uploadSvg),
                  ),
                ),
                SizedBox(height: 15.h),
                Text('Upload File', style: TextStyles.font12RegularBlack),
                SizedBox(height: 7.h),
                Text(
                  'Take a photo or browse file',
                  style: TextStyles.font10Regular,
                ),
                SizedBox(height: 12.h),
                InkWell(
                  onTap: () async {
                    var image = await ImagePicker().pickImage(
                      source: ImageSource.camera,
                    );
                    if (image != null) {
                      file = image;
                    }
                    setState(() {});
                    if (context.mounted) context.pop();
                  },
                  child: Container(
                    padding: EdgeInsets.only(bottom: 2.h),
                    decoration: BoxDecoration(
                      border: Border(
                        bottom: BorderSide(
                          color: ColorsManager.mainColor,
                          width: 1.0,
                        ),
                      ),
                    ),
                    child: Text(
                      'Take Photo',
                      style: TextStyles.font10Regular.copyWith(
                        color: ColorsManager.mainColor,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );

    widget.chooseFile(file);
  }
}

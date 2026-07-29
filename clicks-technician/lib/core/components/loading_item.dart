// import 'package:flutter/material.dart';
// import 'package:flutter_screenutil/flutter_screenutil.dart';
// import 'package:shimmer/shimmer.dart';

// class LoadingItem extends StatelessWidget {
//   const LoadingItem({super.key});

//   @override
//   Widget build(BuildContext context) {
//     return SizedBox(
//       width: double.infinity,
//       height: 50.h,
//       child: Shimmer.fromColors(
//         baseColor: Colors.red,
//         highlightColor: Colors.yellow,
//         child: Container(
//           margin: EdgeInsets.all(20),
//           child: MaterialButton(
//             onPressed: onPressed,
//             minWidth: width,
//             color: bgColor ?? ColorsManager.whiteColor,
//             height: height ?? 55.h,
//             shape: RoundedRectangleBorder(
//               borderRadius: BorderRadius.circular(radius ?? 14.r),
//               side: BorderSide.none,
//             ),
//             child: Text(label),
//           ),
//         ),
//       ),
//     );
//   }
// }
